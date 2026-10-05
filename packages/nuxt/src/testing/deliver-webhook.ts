import { fetch } from "@nuxt/test-utils/e2e";
import { z } from "zod";
import type { WebhookName } from "../runtime/server/webhooks/registry";
import { callApp } from "./settled";

const signedWebhook = z.object({ rawBody: z.string(), headers: z.record(z.string(), z.string()) });

/**
 * Sends a webhook delivery to the app under test, signed the way the webhook's `verify` checks it, and returns the response.
 *
 * The app signs with the current secret of the provider. Set its env var before the app starts.
 * It signs for `stripe`, `github`, `resend`, `mailgun` and {@link hmac}.
 * A webhook with its own `verify` function rejects: sign the request and send it with `fetch` yourself.
 * Each call is a new delivery, with a new Mailgun token and a new Resend id.
 * Send the same `body` twice to test the repeat path of `eventId`.
 * Use {@link expectQueued} to check what the handler did.
 *
 * @param name A {@link WebhookName} from `server/webhooks/`.
 * @param body The JSON payload. For Mailgun, leave out `signature`.
 *
 * @example
 * ```ts
 * const response = await deliverWebhook("billing", { id: "evt_1", type: "invoice.paid" });
 * expect(response.status).toBe(200);
 * await expectQueued("billing.process-event", { id: "evt_1" });
 * ```
 *
 * See {@link defineWebhook}.
 */
export async function deliverWebhook(name: WebhookName, body: Record<string, unknown>): Promise<Response> {
  const { rawBody, headers } = signedWebhook.parse(await callApp("sign-webhook", { name, body }));

  return fetch(`/api/webhooks/${name}`, { method: "POST", headers, body: rawBody });
}
