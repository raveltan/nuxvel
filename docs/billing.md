# Billing

## Introduction

nuxvel takes payments with [Stripe](https://stripe.com). The customer is the user: each user pays for their own subscriptions and one-time purchases. Users pay on Stripe's hosted Checkout page and manage their billing in Stripe's Customer Portal, so card data never reaches your app.

Billing is off until you turn it on.

## Configuration

Install the Stripe SDK and turn billing on:

```bash
npm install stripe
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  nuxvel: { billing: true },
});
```

Re-export nuxvel's billing tables from a schema file of the app, then generate and run the migration:

```ts
// server/database/schema/billing.schema.ts
export { billingCustomersTable, billingEventsTable, billingPaymentsTable, billingSubscriptionsTable } from "@nuxvel/nuxt/database";
```

```bash
npx nuxvel db:generate billing
npx nuxvel db:migrate
```

| Table | Rows |
|---|---|
| `billing_customers` | The Stripe customer of each user, created on their first checkout |
| `billing_events` | Every Stripe event that the webhook received, by its Stripe ID |
| `billing_subscriptions` | Each subscription of a user, as Stripe last reported it |
| `billing_payments` | Each one-time payment of a user, with its amount and whether it was refunded |

nuxvel writes these rows. Read them in your app, but do not write them: Stripe is the source of truth. [`nuxvel test:arch`](./cli.md#nuxvel-testarch) refuses server code that inserts into, updates or deletes from a billing table, with the rule `nuxvel/billing-writes`. A test may write them.

Set two variables:

| Variable | Value |
|---|---|
| `NUXT_STRIPE_SECRET_KEY` | A secret key (`sk_`) or a restricted key (`rk_`) from the Stripe dashboard, under Developers, API keys |
| `NUXT_STRIPE_WEBHOOK_SECRET` | The signing secret (`whsec_`) of the webhook endpoint for `/api/webhooks/stripe` |

A server with `NODE_ENV=production` refuses to start without them. `nuxvel doctor` names the missing one.

The server also checks which kind of key it has:

- A server without `NODE_ENV=production`, and every build for `nuxt dev` or for tests, refuses a live key (`sk_live_` or `rk_live_`), so a development machine or a test never takes a real payment. Use a test key (`sk_test_`) there.
- A production server with a test key starts, for a staging server, and logs a warning that Stripe takes no real payment.
- Every server refuses a publishable key (`pk_`).

In production, prefer a restricted key with access to only the resources that the app uses.

## Products

A product is something a user can buy. Define each one in its own file under `server/products/`:

```ts
// server/products/pro.product.ts
export const proProduct = defineProduct({ lookupKey: "pro_monthly", mode: "subscription" });
```

```ts
// server/products/course.product.ts
export const courseProduct = defineProduct({ lookupKey: "course", mode: "payment" });
```

| Option | Meaning |
|---|---|
| `lookupKey` | The lookup key of the Stripe price. Give the test mode price and the live mode price the same lookup key, and one product works in both. |
| `mode` | `"subscription"` for a price that renews, `"payment"` for a one-time payment. |

The path names the product, as for every definition: `server/products/pro.product.ts` is the product `"pro"`. The auto-imported `$products` namespace holds each product under its path, so `$products.pro` refers to it with go-to-definition. `ProductName` is the union of the names.

The price and its amount stay in Stripe. The app only refers to a price by its lookup key, so a price change needs no deploy.

Billing rows keep the name of the product. To rename a product file, keep the old name with [`renamed()`](./index.md#renaming-a-definition).

## Checkout

`checkout()` starts a Stripe Checkout for one product and returns the URL to send the user to. Call it from a procedure:

```ts
// server/trpc/routers/billing.router.ts
export const billingRouter = router({
  upgrade: authedProcedure.mutation(({ ctx }) =>
    checkout(ctx.user, $products.pro, { successUrl: "/billing?session={CHECKOUT_SESSION_ID}", cancelUrl: "/pricing" }),
  ),
});
```

```vue
<script setup lang="ts">
const upgrade = $api.billing.upgrade.useMutation({
  onSuccess: (url) => navigateTo(url, { external: true }),
});
</script>
```

Stripe asks for the card, then sends the user to `successUrl`, or to `cancelUrl` when they go back. Stripe replaces `{CHECKOUT_SESSION_ID}` in `successUrl` with the ID of the session. Each URL is a path of the app, or a URL on its origin. `checkout()` refuses a URL on another origin, so a checkout can only send the user back to the app.

- The first checkout of a user creates their Stripe customer, once, however many requests race.
- The price is the active Stripe price with the product's lookup key. The amount never comes from the browser.
- `checkout()` throws when no active price has the lookup key, or when a renewing price belongs to a `payment` product, or a one-time price to a `subscription` product.
- `checkout()` grants nothing. The success page is not proof of payment. Access follows the Stripe webhook, once Stripe says that the user paid.

## Subscriptions

The `nuxvel.billing.process-event` job turns each Stripe event about a subscription into a row of `billing_subscriptions`. It fetches the subscription again from Stripe, so an event that arrives late or twice cannot roll the row back. It finds the product by the lookup key of the subscription's price, so a plan change in the Customer Portal moves the row to the new product. A subscription whose customer is not a user of the app, or whose price has no lookup key of a product, is ignored with a warning in the log.

`subscribed()` tells whether a user has a subscription that gives access:

```ts
report: authedProcedure.query(async ({ ctx }) => {
  if (!(await subscribed(ctx.user, $products.pro))) throw new ForbiddenError("Reports need the Pro plan");
  return buildReport(ctx.user.id);
}),
```

| Stripe status | `subscribed()` |
|---|---|
| `active`, `trialing` | `true`. A subscription cancelled at the end of its period stays `active` until then |
| `past_due` | `false`: the renewal failed, and Stripe retries the payment |
| `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused` | `false` |

Without a product, `subscribed(user)` is `true` for a subscription to any product. It reads `billing_subscriptions` and makes no call to Stripe.

`checkout()` throws `ConflictError` for a product that the user already subscribes to, so nobody pays twice.

Each change of status, product, period end or cancellation writes the audit entry `billing.subscription.changed` as the system actor `stripe`, and emits `billingSubscriptionChangedEvent`. Listen to it to grant or remove what a product gives:

```ts
// server/listeners/billing/welcome.listener.ts
export const billingWelcomeListener = defineListener({
  event: billingSubscriptionChangedEvent,
  async handler({ userId, product, status, previousStatus }) {
    if (status === "active" && previousStatus === null) await notify(userId, $notifications.welcomePro, { product });
  },
});
```

The payload has `userId`, `product`, `subscriptionId`, `status`, `previousStatus` (`null` for a new subscription) and `cancelAtPeriodEnd`.

## One-time payments

A product with `mode: "payment"` is bought once. The job records a payment in `billing_payments` when Stripe reports the Checkout session as paid, after it checks the session against the product:

- the session was started by `checkout()` for a user of the app, and names the same user as its customer,
- it holds exactly one item, the price with the product's lookup key,
- its amount before tax is the amount of that price, in its currency.

A session that fails a check records nothing: the job fails, and the event keeps the error. A payment by a method that takes days, such as a bank transfer, is recorded when Stripe reports it as paid.

`paid()` tells whether a user paid for a product and keeps it:

```ts
lessons: authedProcedure.query(async ({ ctx }) => {
  if (!(await paid(ctx.user, $products.course))) throw new ForbiddenError("Buy the course first");
  return listLessons();
}),
```

| Payment status | `paid()` |
|---|---|
| `paid` | `true` |
| `partially_refunded` | `true` |
| `refunded` | `false` |
| `disputed` | `false`: the user's bank disputed the payment, a chargeback |

Each payment, refund and dispute writes an audit entry as the system actor `stripe` (`billing.payment.paid`, `billing.payment.refunded`, `billing.payment.disputed`), and emits an event:

| Event | Payload |
|---|---|
| `billingPaidEvent` | `userId`, `product`, `checkoutSessionId`, `amount`, `currency` |
| `billingRefundedEvent` | `userId`, `product`, `checkoutSessionId`, `amountRefunded` (the total so far), `fullyRefunded` |
| `billingDisputedEvent` | `userId`, `product`, `checkoutSessionId`, `reason` |

```ts
// server/listeners/billing/enroll.listener.ts
export const courseEnrollListener = defineListener({
  event: billingPaidEvent,
  async handler({ userId, product }) {
    if (product === "course") await enrollAction({ userId }, { actor: systemActor("billing") });
  },
});
```

Amounts are in the currency's smallest unit, such as cents. Refund a payment, and answer a dispute, in the Stripe dashboard.

## The Customer Portal

`billingPortal()` opens the Stripe Customer Portal of a user and returns its URL. There the user changes their card, sees their invoices and cancels a subscription. Set up what the portal allows in the Stripe dashboard, under Settings, Billing, Customer portal:

```ts
manage: authedProcedure.mutation(({ ctx }) => billingPortal(ctx.user, { returnUrl: "/billing" })),
```

It throws `NotFoundError` for a user who never went through checkout.

## The Stripe webhook

With billing on, nuxvel answers Stripe's events at `POST /api/webhooks/stripe`. In the Stripe dashboard, under Developers, Webhooks, add an endpoint with this URL, and copy its signing secret to `NUXT_STRIPE_WEBHOOK_SECRET`. During development, forward the events of a test account with the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe listen` prints the signing secret to use while it runs.

For each event, the webhook:

1. checks the Stripe signature, and refuses a delivery older than 5 minutes,
2. refuses an event whose `livemode` does not match the key, with 400, so a test event never counts in production,
3. stores the event in `billing_events`, by its Stripe ID, in one transaction with the dispatch of the built-in `nuxvel.billing.process-event` job,
4. answers 200 once the transaction commits.

A repeated event is stored once and queues no second job, also after the 7 days for which nuxvel's [webhook guard](./webhooks.md#repeat-deliveries) remembers a delivery. The table keeps only the type of the event and the ID of its object, not the object: the job fetches the object again from Stripe. The job locks the event row, does nothing for an event that it already processed, and marks the event processed in the same transaction as its work. When the job fails, the row keeps the error and the number of attempts, and the queue retries the job up to 10 times.

### Missed events

A webhook can miss an event: the app was down for longer than Stripe retries, or the endpoint was set up late. The built-in `nuxvel.billing.reconcile` schedule runs every day at 03:15. It lists the events of the last 30 days from Stripe, the time that Stripe keeps them, of the types that nuxvel handles, and stores and processes each one that `billing_events` does not have yet. An event that it already has changes nothing. It logs a warning with the number of events it stored.

`nuxvel billing:status` prints the number of stored events and lists the ones that are not processed, with their attempts and last error. It exits 1 when one of them failed. `nuxvel billing:replay <eventId>` processes a stored event again, once the cause of its failure is fixed. See [CLI: Billing](./cli.md#billing).

## Erasing a user

[`eraseUserData()`](./privacy.md#erasing-a-users-data) and `nuxvel user:erase` first cancel the user's active subscriptions in Stripe, at once, so Stripe charges them no more. When Stripe refuses, the erasure throws and erases nothing. The rows of `billing_subscriptions` are marked as Stripe answered.

The billing rows stay: payment records are kept for accounting. They hold the ID of the user, not their name or email address, and the user row is gone. The Stripe customer, with its email address and invoices, stays in Stripe. Delete it in the Stripe dashboard when your accounting allows.

## The Stripe client

`useStripe()` returns the app's Stripe client, for a call that the billing helpers do not make. It is auto-imported on the server when billing is on:

```ts
const invoices = await useStripe().invoices.list({ customer: customerId, limit: 10 });
```

A failed request is retried twice with the same idempotency key, so Stripe runs it only once.

## Testing

A test build answers every Stripe request from an in-memory Stripe, so a test never reaches Stripe. The test helpers of `@nuxvel/nuxt/testing` change it as a payment would, then send each Stripe event through the real webhook and job:

```ts
const user = await userFactory();

await completeCheckout(user, $products.pro);
await expectSubscribed(user, $products.pro);

await failRenewal(user, $products.pro);
await expectNotSubscribed(user, $products.pro);

await completeCheckout(user, $products.course);
await refundPayment(user, $products.course);
await expectNotPaid(user, $products.course);
```

In an end-to-end test, `checkout()` and `billingPortal()` send the browser to test pages of the app in place of Stripe's, and `fakeStripe({ checkout: "pay" })` pays at once. See [Testing: Stripe](./testing.md#stripe).
