# Webhooks

## Introduction

A webhook is a URL in your app that a third-party provider posts events to. For example, a newsletter provider tells your blog when a reader subscribes. nuxvel checks the signature of each delivery and validates the payload. It runs the handler one time for each event, also when the provider sends the event again.

Your app can also post its own events to other apps. See [Outbound webhooks](#outbound-webhooks).

## Defining a webhook

```ts
// server/webhooks/newsletter.webhook.ts
import { z } from "zod";

export const newsletterWebhook = defineWebhook({
  payload: z.object({ id: z.string(), type: z.string() }),
  verify: hmac({ header: "x-signature", secret: "NUXT_NEWSLETTER_WEBHOOK_SECRET" }),
  eventId: ({ payload }) => payload.id,
  handler: async ({ payload }) => {
    await $jobs.subscriber.sync.dispatch(payload);
  },
});
```

Put each webhook in its own file under `server/webhooks/`, as a named export. `defineWebhook` is auto-imported. nuxvel finds the file and mounts it. You do not register it.

The file above answers at `POST /api/webhooks/newsletter`. Give this URL to the provider. The file path gives the webhook name, and the name is the last segment of the URL:

| File | Name | URL |
|---|---|---|
| `server/webhooks/newsletter.webhook.ts` | `newsletter` | `POST /api/webhooks/newsletter` |
| `server/webhooks/newsletter/mailgun.webhook.ts` | `newsletter.mailgun` | `POST /api/webhooks/newsletter.mailgun` |

| Option | Meaning |
|---|---|
| `payload` | Optional. The Zod schema that the parsed JSON body must match. |
| `verify` | A built-in provider name, `hmac()`, or a function that returns `true` when the request has a valid signature. |
| `eventId` | Optional. Returns the provider's unique ID for the event, from the payload. Without it, nuxvel uses the SHA-256 hash of the body. |
| `handler` | Runs one time for each verified event. |

To generate the file, run:

```sh
nuxvel make:webhook newsletter
```

The command writes the webhook file and a functional test next to it. The file has the schema `z.object({ id: z.string(), type: z.string() })`, reads the secret `NUXT_NEWSLETTER_WEBHOOK_SECRET` and logs each event. The test sends three deliveries: a signed one, a signed one that fails the schema, and one with a bad signature.

## Verifying the signature

For a provider that nuxvel knows, give its name as `verify`:

```ts
// server/webhooks/billing.webhook.ts
import { z } from "zod";

export const billingWebhook = defineWebhook({
  payload: z.object({ id: z.string(), type: z.string() }),
  verify: "stripe",
  eventId: ({ payload }) => payload.id,
  handler: async ({ payload }) => {
    await $jobs.billing.processEvent.dispatch(payload);
  },
});
```

Each provider name reads its signing secret from a fixed env var:

| `verify` | Signature | Secret |
|---|---|---|
| `"stripe"` | The `stripe-signature` header. A signature older than 5 minutes fails. | `NUXT_STRIPE_WEBHOOK_SECRET` |
| `"github"` | The `x-hub-signature-256` header. | `NUXT_GITHUB_WEBHOOK_SECRET` |
| `"resend"` | The `svix-id`, `svix-timestamp` and `svix-signature` headers. A signature older than 5 minutes fails. | `NUXT_RESEND_WEBHOOK_SECRET` |
| `"mailgun"` | The `signature` object in the body. A signature older than 5 minutes fails. A token that nuxvel saw before fails. | `NUXT_MAILGUN_WEBHOOK_SIGNING_KEY` |

Mailgun signs only the `timestamp` and the `token`, not the event. nuxvel accepts each token one time. Mailgun uses one signing key for all webhooks of the account. When other systems get webhooks from the same Mailgun account, they see signed tokens and can send a forged event before the real delivery arrives. Then put a secret in the webhook URL and check it in your own `verify`.

Many other providers send the hex HMAC-SHA256 of the body in a header. For them, use `hmac()`. It is auto-imported. `header` is the header name, and `secret` is the env var that holds the secret:

```ts
verify: hmac({ header: "x-signature", secret: "NUXT_NEWSLETTER_WEBHOOK_SECRET" }),
```

For bounce and complaint events of Resend and Mailgun, use `defineMailWebhook()`. See [Bounce webhooks](./mail.md#bounce-webhooks).

For all other schemes, write a function. `verify` gets the body exactly as the provider sent it, as `rawBody`, and the request `headers`. It returns `true` when the signature is correct. The header name and the algorithm come from the provider's documentation:

```ts
verify: ({ rawBody, headers }) => checkSignature(rawBody, headers.get("x-signature")),
```

nuxvel runs `verify` first. When it returns `false`, the delivery gets `401` and the handler does not run:

```json
{ "statusCode": 401, "message": "Webhook signature is invalid",
  "data": { "code": "UNAUTHORIZED", "message": "Webhook signature is invalid" } }
```

Each refusal on this page has this [route error shape](./api.md#errors).

### Signing secrets

The provider names and `hmac()` read the secret with `useSecrets()`. In your own `verify` function, read signing secrets with `useSecrets()` too. Then `nuxvel key:rotate` can replace a secret without a rejected delivery: the previous secret stays valid for a grace period. The provider issues the new secret, so give it to the command. Read it from stdin to keep it out of your shell history:

```sh
pbpaste | nuxvel key:rotate NUXT_NEWSLETTER_WEBHOOK_SECRET --stdin
nuxvel key:rotate NUXT_NEWSLETTER_WEBHOOK_SECRET --value whsec_...
```

See [Rotating secrets](./security.md#rotating-secrets).

## Validating the payload

After `verify`, nuxvel parses the body as JSON. A body that is not JSON gets `400`. Its `data` is a [validation error](./validation.md#error-shape) with `"fields": { "": ["Webhook body is not valid JSON"] }`.

Then nuxvel checks the JSON against the `payload` schema. The schema can use async refinements and transforms. A payload that fails gets `400` with the usual validation error:

```json
{ "statusCode": 400, "message": "Invalid input",
  "data": { "code": "VALIDATION_ERROR", "message": "Invalid input",
            "fields": { "type": ["Invalid input: expected string, received undefined"] } } }
```

nuxvel does not record the key of a payload that fails. So a corrected delivery with the same ID still runs.

`eventId` gets the parsed payload as `payload`, with the output type of the schema. `handler` gets `payload` and the request `headers`.

### Without a schema

`payload` is optional. Without it, `payload` has the type `unknown`. Check it with `safeParse` in `eventId` and `handler`, and return without an error for the events that you do not handle.

Leave out the schema when the provider sends event types that you do not model. The provider sends a rejected payload again until it stops. It does the same for an `eventId` or a `handler` that throws, which gets `500`.

## Handling a delivery

After the handler returns, the delivery gets `200`:

```json
{ "received": true }
```

Keep the handler quick. Providers stop waiting for a slow endpoint and send the event again. Give the real work to a [job](./queues.md) with `$jobs.x.dispatch()`, as in the example above.

## Repeat deliveries

Providers retry, so the same event can arrive more than one time. nuxvel keeps a key for each event:

- With `eventId`, the key is the ID that it returns. `eventId` gets only the payload, not the headers. A header such as GitHub's `x-github-delivery` is not signed, so an attacker can send a copy of a delivery with a new header value. Use `eventId` when the signed body contains the event ID (Stripe), or when the provider signs each retry again (Mailgun).
- Without `eventId`, the key is the SHA-256 hash of the raw body. Leave out `eventId` when the body has no event ID (GitHub) or when the ID is only in a header. Each retry must then send the same body.
- When `eventId` returns an empty string, the delivery gets `400` with `"fields": { "": ["Webhook event ID is empty"] }`.

The key then follows these rules:

- When the handler succeeds, nuxvel records the key in Redis for 7 days. A repeat of the event gets `200 { "received": true }`, and the handler does not run again.
- While the handler runs, a repeat of the event gets `409`. The provider then tries again later. The repeat is not acknowledged, because the first delivery can still fail.
- When the handler throws, the delivery gets `500`. nuxvel release:list the key, so the next retry of the provider runs the handler.

```json
{ "statusCode": 409, "message": "This delivery is already being handled",
  "data": { "code": "CONFLICT", "message": "This delivery is already being handled" } }
```

nuxvel holds the key for one minute at most while the handler runs. When a server stops during the handler, the event is blocked for one minute at most.

`"github"` and `hmac()` sign only the body and check no time. After 7 days, nuxvel forgets the key, and a copy of the delivery runs the handler again.

## Responses

| Status | When |
|---|---|
| `200 { "received": true }` | The handler ran, or it ran before for this event key. |
| `400` | The body is not JSON, the payload fails the schema, or `eventId` returned an empty string. |
| `401` | `verify` returned `false`. |
| `404` | No webhook has this name. |
| `409` | The handler for this event key is running now. |
| `500` | `eventId` or `handler` threw. |

## HTML in payloads

The XSS validator of `nuxt-security` is off for `/api/webhooks/**`. A payload that contains HTML, for example an email body or a comment, arrives unchanged. The signature is what makes the payload trusted. See [Security](./security.md).

## Renaming a webhook

```ts
// server/webhooks/newsletter.webhook.ts
import { newsletterMailgunWebhook } from "./newsletter/mailgun.webhook";

export default renamed(newsletterMailgunWebhook);
```

When you move a webhook file, its URL changes. Keep the old file as a `renamed()` alias. The webhook then also answers at the old URL, until you give the new URL to the provider. See [Renaming a definition](./index.md#renaming-a-definition).

## Testing

```ts
// server/webhooks/newsletter.webhook.test.ts
import { deliverWebhook, describe, expect, expectQueued, it } from "@nuxvel/nuxt/testing";
import { randomUUID } from "node:crypto";

process.env.NUXT_NEWSLETTER_WEBHOOK_SECRET = "newsletter-webhook-test-secret";

describe("newsletter webhook", () => {
  it("syncs the subscriber of a signed delivery", async () => {
    const id = randomUUID();

    const response = await deliverWebhook("newsletter", { id, type: "subscriber.created" });

    expect(response.status).toBe(200);
    await expectQueued("subscriber.sync", { id });
  });
});
```

Set the secret in `process.env` at the top level of the test file, before the app starts. `deliverWebhook` signs the body in the app with that secret and sends it to the real endpoint. It signs for `stripe`, `github`, `resend`, `mailgun` and `hmac()`. Each call is a new delivery. `expectQueued` checks the job that the handler dispatched. See [Testing](./testing.md).

A webhook with its own `verify` function needs a signed request that you write. Send it with `guest().fetch`:

```ts
import { createHmac } from "node:crypto";
import { guest } from "@nuxvel/nuxt/testing";

const body = JSON.stringify({ id: "evt_1", type: "subscriber.created" });
const signature = createHmac("sha256", process.env.NUXT_NEWSLETTER_WEBHOOK_SECRET!).update(body).digest("hex");

const response = await guest().fetch("/api/webhooks/newsletter", {
  method: "POST",
  headers: { "content-type": "application/json", "x-signature": signature },
  body,
});
```

## Outbound webhooks

An outbound webhook is a URL in another app that your app posts its events to. For example, a helpdesk tells a CRM when a ticket opens. An admin adds the URL. nuxvel signs each delivery and retries a failed delivery through the [queue](./queues.md).

### The endpoints table

The starter app has the `webhook_endpoints` table in `server/database/schema/webhook-endpoints.schema.ts`. Each row is one endpoint: its URL and its signing secret. An app from an older starter adds the same schema file and runs `nuxvel db:generate`:

```ts
// server/database/schema/webhook-endpoints.schema.ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";

export const webhookEndpointsTable = pgTable("webhook_endpoints", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
});
```

### Managing the endpoints

nuxvel does not decide who can manage the endpoints. Write the procedures, and gate them with the procedure that fits your app:

```ts
// server/trpc/routers/webhook-endpoints.router.ts
import { z } from "zod";

export const webhookEndpointsRouter = {
  list: adminProcedure.query(() => listWebhookEndpoints()),
  create: adminProcedure
    .input(z.object({ url: z.string() }))
    .mutation(({ input }) => addWebhookEndpoint(input.url)),
  remove: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ input }) => removeWebhookEndpoint(input.id)),
};
```

These functions are auto-imported on the server:

| Function | What it does |
|---|---|
| `addWebhookEndpoint(url)` | Adds the endpoint and returns `{ id, url, secret, createdAt }`. |
| `listWebhookEndpoints()` | Returns the endpoints, oldest first, without their secrets. |
| `removeWebhookEndpoint(id)` | Removes the endpoint. Its queued deliveries do nothing. It throws `NotFoundError` for an unknown ID. |

The secret starts with `whsec_`. Show it to the admin one time. nuxvel does not show it again.

`addWebhookEndpoint()` accepts only an `https://` URL. It refuses an IP address that is private, loopback, link-local or a cloud metadata address, such as `10.0.0.1` or `169.254.169.254`. For each refused URL, it throws a [validation error](./validation.md#error-shape) on the `url` field. In dev and in tests, it also accepts `localhost`, `127.0.0.1` and `[::1]`, with `http://` or `https://`.

### Sending an event

```ts
await sendWebhook("ticket.created", { id: ticket.id, subject: ticket.subject });
```

`sendWebhook(event, data)` is auto-imported on the server. It posts the event to each endpoint after the surrounding transaction commits. When the transaction rolls back, nothing is sent. Send only data that every endpoint may see.

Each endpoint gets its own `nuxvel.webhook` job on the `webhooks` queue. The body is JSON:

```json
{ "type": "ticket.created", "timestamp": "2026-09-29T08:00:00.000Z", "data": { "id": 7, "subject": "Cannot sign in" } }
```

### Signatures

The delivery uses the [Standard Webhooks](https://www.standardwebhooks.com) headers:

| Header | Value |
|---|---|
| `webhook-id` | The ID of the event. All endpoints and all retries of one event get the same ID. |
| `webhook-timestamp` | The time of this attempt, in seconds since 1970. |
| `webhook-signature` | `v1,` and the base64 HMAC-SHA256 of `<webhook-id>.<webhook-timestamp>.<body>`. The key is the secret without `whsec_`, base64-decoded. |

The receiver checks the signature with a Standard Webhooks library, and it refuses an old timestamp. Use the ID to ignore a repeated event.

### Retries

A delivery succeeds when the endpoint answers with a `2xx` status. nuxvel does not follow a redirect. Another status, a timeout after 10 seconds or a network error fails the attempt. The job tries 8 times, with an exponential backoff that starts at 30 seconds. A delivery for an endpoint that was removed does nothing.

### Private addresses

At each attempt, nuxvel resolves the host name of the endpoint again. It refuses to connect when one of the addresses is private, loopback, link-local or a cloud metadata address. Then the job fails and does not retry. The connection goes to the address that nuxvel checked. So a DNS name that changes to a private address after the check cannot reach your network. In dev and in tests, a loopback address is permitted.

An endpoint uses `https://`. In dev and in tests, `http://` is permitted too.

### Testing

`sendWebhook()` queues one `nuxvel.webhook` job for each endpoint after the transaction commits. Check the sends with `expectWebhookSent()` and `expectNoWebhookSent()`. They read these jobs, so a test does not name the job or parse its JSON body:

```ts
import { expectNoWebhookSent, expectWebhookSent } from "@nuxvel/nuxt/testing";

const { type, data } = await expectWebhookSent("ticket.created", { data: { id: ticket.id } });
await expectNoWebhookSent("ticket.deleted");
```

`expectWebhookSent(type, match?, { times? })` returns the parsed `{ type, timestamp, data }` of the latest match. `match.data` checks the top-level fields of `data`. `match.endpoint` is the ID of one endpoint. One event counts once, even when many endpoints get it, unless `match.endpoint` is set. `expectNoWebhookSent(type?)` fails when the test sent an event, or an event of that `type`. A rolled-back `sendWebhook()` sends nothing.

To check the delivery, run the job with `runJob("nuxvel.webhook", ...)`. In a test, a loopback address is permitted, so a local server can receive it. To check the request, use `fakeFetch()`, run the queue with `workQueue()`, and check it with `expectFetched()`. See [Testing](./testing.md).

## See also

- [Queues](./queues.md)
- [Security](./security.md)
- [Validation](./validation.md)
- [Testing](./testing.md)
