import type { z } from "zod";
import { awaitingName } from "../discovery/definition-name";
import { type WebhookProvider, type WebhookVerifier, providerVerifier } from "./verifiers";

/** What a webhook's `verify` sees: the request body exactly as sent, and its headers. */
export interface WebhookRequest {
  rawBody: string;
  headers: Headers;
}

/**
 * What a webhook's `handler` sees: the verified body parsed as JSON (and
 * by the `payload` schema, when there is one) and the request headers.
 */
export interface WebhookDelivery<Payload = unknown> {
  payload: Payload;
  headers: Headers;
}

/**
 * What a delivery's parsed JSON body turned into: an event to handle, or the reason its payload is invalid.
 * `eventId` is `undefined` when the webhook has no `eventId`.
 */
export type WebhookReceipt =
  | { success: true; eventId: string | undefined; handle: () => void | Promise<void> }
  | { success: false; error: z.ZodError };

/**
 * A defined webhook: its name, how it checks a signature, and how it
 * turns a verified JSON body into an event to handle once. The name is
 * its file's path under `server/webhooks/`.
 */
export interface Webhook<Name extends string = string> {
  readonly name: Name;
  verify: WebhookVerifier;
  receive: (payload: unknown, headers: Headers) => Promise<WebhookReceipt>;
}

interface WebhookBase {
  verify: WebhookProvider | WebhookVerifier;
}

interface TypedWebhookConfig<Schema extends z.ZodType> extends WebhookBase {
  payload: Schema;
  eventId?: (delivery: { payload: z.output<Schema> }) => string;
  handler: (delivery: WebhookDelivery<z.output<Schema>>) => void | Promise<void>;
}

interface UntypedWebhookConfig extends WebhookBase {
  payload?: undefined;
  eventId?: (delivery: { payload: unknown }) => string;
  handler: (delivery: WebhookDelivery) => void | Promise<void>;
}

function accepted<Payload>(
  config: { eventId?: (delivery: { payload: Payload }) => string; handler: (delivery: WebhookDelivery<Payload>) => void | Promise<void> },
  delivery: WebhookDelivery<Payload>,
): WebhookReceipt {
  return { success: true, eventId: config.eventId?.({ payload: delivery.payload }), handle: () => config.handler(delivery) };
}

/**
 * Defines a webhook: an endpoint a third-party provider posts events to.
 *
 * `defineWebhook` is auto-imported. One webhook per file, under
 * `server/webhooks/`; the file is discovered and mounted at
 * `POST /api/webhooks/<name>`, so nothing registers it. Its path is the
 * webhook's name (`server/webhooks/billing/stripe.webhook.ts` is
 * `"billing.stripe"`), part of {@link WebhookName}; {@link renamed} at
 * the old path keeps a moved one answering at its old URL.
 *
 * `verify` runs first, on the raw body, so a provider's signature can be
 * checked byte for byte. A delivery it rejects is answered `401` and never
 * reaches `handler`. A verified one is parsed as JSON — a body that isn't
 * is answered `400` — then by the `payload` schema when there is one; a
 * payload the schema rejects is answered `400` with a
 * {@link ValidationError}, before its key is recorded. The rest is handed
 * to `handler`, typed as the schema's output (`unknown` without one), and
 * answered `200`. Keep `handler` quick: hand the work to a job with
 * {@link Job.dispatch}. Read signing secrets with
 * {@link useSecrets} so they can be rotated.
 *
 * Providers retry, so the same event can arrive more than once. nuxvel
 * keys each delivery on the ID `eventId` returns, or on the SHA-256 of
 * the raw body when there is no `eventId`. `eventId` sees only the
 * payload, not the headers: a header is not signed, and a copy of a
 * delivery with a new header value would run again. An empty ID is
 * answered `400`. While `handler` runs the key is held for up to a
 * minute, and a duplicate arriving meanwhile is answered `409` so the
 * provider retries it later; once `handler` succeeds the key is recorded
 * in Redis for 7 days, and a repeat is answered `200` without running
 * `handler` again. A delivery whose `handler` throws is released, so the
 * provider's retry runs it; a throwing `eventId` or `handler` is
 * answered `500`.
 *
 * @param config.payload Optional Zod schema the parsed body must match,
 * async refinements and transforms included; it types `payload` in
 * `eventId` and `handler`. Describe every event the
 * provider may send, or acknowledge the ones you ignore in `handler`: a
 * rejected payload is retried by the provider.
 * @param config.verify Whether the request carries a valid signature: a
 * built-in {@link WebhookProvider} name such as `"stripe"` or `"github"`,
 * {@link hmac} for a hex HMAC-SHA256 header, or your own function.
 * @param config.eventId Optional. The provider's unique ID for the event,
 * read from the signed payload. Leave it out when the body has no ID
 * (GitHub) or the ID is only in a header: the SHA-256 of the body is
 * used, so a retry must send the same body.
 * @param config.handler Runs once per verified delivery.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 *
 * // server/webhooks/billing.webhook.ts
 * export const billingWebhook = defineWebhook({
 *   payload: z.object({ id: z.string(), type: z.string() }),
 *   verify: "stripe",
 *   eventId: ({ payload }) => payload.id,
 *   handler: async ({ payload }) => {
 *     await $jobs.billing.processEvent.dispatch(payload);
 *   },
 * });
 * ```
 */
export function defineWebhook<Schema extends z.ZodType>(config: TypedWebhookConfig<Schema>): Webhook;
/**
 * Defines a webhook with no `payload` schema: `eventId` gets the
 * parsed JSON body as `unknown`, and `handler` gets it with the headers. See the overload above for the rest.
 */
export function defineWebhook(config: UntypedWebhookConfig): Webhook;
export function defineWebhook(config: TypedWebhookConfig<z.ZodType> | UntypedWebhookConfig): Webhook {
  const webhook: Webhook = {
    name: "",
    verify: providerVerifier(config.verify),
    receive: async (payload, headers) => {
      if (config.payload === undefined) return accepted(config, { payload, headers });

      const result = await config.payload.safeParseAsync(payload);

      if (!result.success) return { success: false, error: result.error };

      return accepted(config, { payload: result.data, headers });
    },
  };

  return awaitingName(webhook, "webhook");
}
