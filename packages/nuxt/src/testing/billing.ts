import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ProductName } from "../runtime/server/billing/products";
import { billingPaymentsTable, billingSubscriptionsTable } from "../runtime/server/billing/tables";
import type { StripeScenarioResult } from "../runtime/server/testing/stripe/scenario-result";
import { testDatabase } from "./database";
import { callApp } from "./settled";

/** A product as a test refers to it: `$products.pro` from the test namespaces, or any `{ name }`. */
export interface ProductRef {
  name: ProductName;
}

/** The user a billing test helper acts for: their `id`, and their `email` where Stripe needs one. */
export interface BillingTestUser {
  id: string;
  email: string;
}

const SUBSCRIBED_STATUSES = ["active", "trialing"];

const scenarioResult = z.object({
  checkoutSessionId: z.string().optional(),
  subscriptionId: z.string().optional(),
  paymentIntentId: z.string().optional(),
});

async function scenario(body: Record<string, unknown>): Promise<StripeScenarioResult> {
  return scenarioResult.parse(await callApp("stripe-scenario", body));
}

/**
 * Runs a whole Stripe Checkout for a user, as if they paid: it calls
 * `checkout()`, pays the session in the test build's in-memory Stripe,
 * then sends each Stripe event that a real payment sends through the
 * real `POST /api/webhooks/stripe` and runs the
 * `nuxvel.billing.process-event` job for it. The rows, the audit
 * entries and the events are those of a real payment.
 *
 * Reach for it to give a user a product in a test about something else,
 * and to test what the app does once a user pays. It works in an
 * end-to-end test too.
 *
 * @returns The IDs of the Checkout session, and of the subscription or
 * the payment intent.
 *
 * @example
 * ```ts
 * const user = await userFactory();
 * await completeCheckout(user, $products.pro);
 * await expectSubscribed(user, $products.pro);
 *
 * await completeCheckout(user, $products.course);
 * await expectPaid(user, $products.course);
 * ```
 */
export async function completeCheckout(user: BillingTestUser, product: ProductRef): Promise<StripeScenarioResult> {
  return scenario({ kind: "complete-checkout", user: { id: user.id, email: user.email }, product: product.name });
}

/**
 * Renews the user's subscription to `product` in the in-memory Stripe
 * for one more period, and sends the event through the real Stripe
 * webhook and job, as {@link completeCheckout} does.
 *
 * @example
 * ```ts
 * await travelBy({ days: 31 });
 * await renewSubscription(user, $products.pro);
 * ```
 */
export async function renewSubscription(user: { id: string }, product: ProductRef): Promise<StripeScenarioResult> {
  return scenario({ kind: "renew", user: { id: user.id }, product: product.name });
}

/**
 * Fails the renewal of the user's subscription to `product`: Stripe
 * marks it `past_due`, and {@link expectSubscribed} no longer passes.
 * The event goes through the real Stripe webhook and job.
 *
 * @example
 * ```ts
 * await failRenewal(user, $products.pro);
 * await expectNotSubscribed(user, $products.pro);
 * ```
 */
export async function failRenewal(user: { id: string }, product: ProductRef): Promise<StripeScenarioResult> {
  return scenario({ kind: "fail-renewal", user: { id: user.id }, product: product.name });
}

/**
 * Cancels the user's subscription to `product`, as the Customer Portal
 * does. By default it ends with the paid period: it stays active, with
 * `cancelAtPeriodEnd`. The event goes through the real Stripe webhook
 * and job.
 *
 * @param options.now Ends it at once, with the status `canceled`.
 *
 * @example
 * ```ts
 * await cancelSubscription(user, $products.pro, { now: true });
 * await expectNotSubscribed(user, $products.pro);
 * ```
 */
export async function cancelSubscription(
  user: { id: string },
  product: ProductRef,
  options: { now?: boolean } = {},
): Promise<StripeScenarioResult> {
  return scenario({ kind: options.now ? "cancel-now" : "cancel", user: { id: user.id }, product: product.name });
}

async function subscriptionRows(userId: string, product?: ProductRef) {
  return testDatabase()
    .select()
    .from(billingSubscriptionsTable)
    .where(and(eq(billingSubscriptionsTable.userId, userId), product ? eq(billingSubscriptionsTable.product, product.name) : undefined));
}

function shown(rows: { product: string; status: string; endedAt: Date | null }[]) {
  return rows.length === 0 ? "The user has no subscription." : `The user has ${rows.map((row) => `${row.product} (${row.status})`).join(", ")}.`;
}

/**
 * Asserts that the user has a subscription to `product` that gives
 * access, as `subscribed()` reads it: status `active` or `trialing`, or
 * the given `status`.
 *
 * @param options.status The Stripe status the subscription must have, such as `"past_due"`.
 *
 * @example
 * ```ts
 * await expectSubscribed(user, $products.pro);
 * await expectSubscribed(user, $products.pro, { status: "past_due" });
 * ```
 */
export async function expectSubscribed(user: { id: string }, product: ProductRef, options: { status?: string } = {}): Promise<void> {
  const rows = await subscriptionRows(user.id, product);
  const statuses = options.status ? [options.status] : SUBSCRIBED_STATUSES;

  if (!rows.some((row) => statuses.includes(row.status) && (options.status !== undefined || row.endedAt === null))) {
    throw new Error(`expectSubscribed: the user ${user.id} has no ${statuses.join(" or ")} subscription to "${product.name}". ${shown(rows)}`);
  }
}

/**
 * Asserts that the user has no subscription that gives access, to
 * `product` when given, to any product otherwise. The opposite of
 * {@link expectSubscribed}.
 *
 * @example
 * ```ts
 * await expectNotSubscribed(user, $products.pro);
 * ```
 */
export async function expectNotSubscribed(user: { id: string }, product?: ProductRef): Promise<void> {
  const rows = await subscriptionRows(user.id, product);

  if (rows.some((row) => SUBSCRIBED_STATUSES.includes(row.status) && row.endedAt === null)) {
    throw new Error(`expectNotSubscribed: the user ${user.id} has a subscription${product ? ` to "${product.name}"` : ""}. ${shown(rows)}`);
  }
}

/**
 * Refunds the user's latest payment for `product` in the in-memory
 * Stripe, as the Stripe dashboard does, and sends the event through the
 * real Stripe webhook and job. A full refund takes the product away.
 *
 * @param options.amount The amount to refund, in the currency's
 * smallest unit. Without it, what is left of the payment.
 *
 * @example
 * ```ts
 * await refundPayment(user, $products.course);
 * await expectNotPaid(user, $products.course);
 * ```
 */
export async function refundPayment(user: { id: string }, product: ProductRef, options: { amount?: number } = {}): Promise<StripeScenarioResult> {
  return scenario({ kind: "refund", user: { id: user.id }, product: product.name, amount: options.amount });
}

/**
 * Opens a dispute, a chargeback, on the user's latest payment for
 * `product` in the in-memory Stripe, and sends the event through the
 * real Stripe webhook and job. The product is taken away.
 *
 * @param options.reason Stripe's reason for the dispute. Defaults to `"fraudulent"`.
 *
 * @example
 * ```ts
 * await disputePayment(user, $products.course);
 * await expectNotPaid(user, $products.course);
 * ```
 */
export async function disputePayment(
  user: { id: string },
  product: ProductRef,
  options: { reason?: string } = {},
): Promise<StripeScenarioResult> {
  return scenario({ kind: "dispute", user: { id: user.id }, product: product.name, reason: options.reason ?? "fraudulent" });
}

const PAID_STATUSES = ["paid", "partially_refunded"];

async function paymentRows(userId: string, product: ProductRef) {
  return testDatabase()
    .select()
    .from(billingPaymentsTable)
    .where(and(eq(billingPaymentsTable.userId, userId), eq(billingPaymentsTable.product, product.name)));
}

function shownPayments(rows: { amount: number; currency: string; status: string }[]) {
  return rows.length === 0 ? "The user has no payment for it." : `The user has ${rows.map((row) => `${row.amount} ${row.currency} (${row.status})`).join(", ")}.`;
}

/**
 * Asserts that the user paid for the one-time `product` and keeps it, as
 * `paid()` reads it: a payment that is `paid` or `partially_refunded`, or
 * that has the given `status`.
 *
 * @param options.status The status the payment must have: `"paid"`, `"partially_refunded"`, `"refunded"` or `"disputed"`.
 *
 * @example
 * ```ts
 * await expectPaid(user, $products.course);
 * await expectPaid(user, $products.course, { status: "refunded" });
 * ```
 */
export async function expectPaid(user: { id: string }, product: ProductRef, options: { status?: string } = {}): Promise<void> {
  const rows = await paymentRows(user.id, product);
  const statuses = options.status ? [options.status] : PAID_STATUSES;

  if (!rows.some((row) => statuses.includes(row.status))) {
    throw new Error(`expectPaid: the user ${user.id} has no ${statuses.join(" or ")} payment for "${product.name}". ${shownPayments(rows)}`);
  }
}

/**
 * Asserts that the user does not keep the one-time `product`: no
 * payment, or one that was fully refunded or disputed. The opposite of
 * {@link expectPaid}.
 *
 * @example
 * ```ts
 * await expectNotPaid(user, $products.course);
 * ```
 */
export async function expectNotPaid(user: { id: string }, product: ProductRef): Promise<void> {
  const rows = await paymentRows(user.id, product);

  if (rows.some((row) => PAID_STATUSES.includes(row.status))) {
    throw new Error(`expectNotPaid: the user ${user.id} keeps "${product.name}". ${shownPayments(rows)}`);
  }
}
