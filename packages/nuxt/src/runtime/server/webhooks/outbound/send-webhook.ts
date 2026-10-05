import { randomUUID } from "node:crypto";
import { now } from "../../clock/now";
import { useDb } from "../../database/client";
import { schemaTable } from "../../database/schema-table";
import { dispatchAfterCommit } from "../../utils/dispatch-after-commit";
import { WEBHOOK_JOB_NAME } from "./jobs/webhook-job-name";

/**
 * Posts an event to every webhook endpoint that
 * {@link addWebhookEndpoint} added, once the surrounding transaction
 * commits.
 *
 * Auto-imported on the server. The body is the JSON
 * `{ "type": event, "timestamp": "<ISO date>", "data": data }`. Each
 * endpoint gets its own `nuxvel.webhook` job on the `webhooks` queue,
 * through {@link dispatchAfterCommit}, so a rolled-back transaction sends
 * nothing. The job signs the delivery with the endpoint's secret in the
 * Standard Webhooks headers `webhook-id`, `webhook-timestamp` and
 * `webhook-signature`. It retries an answer that is not 2xx up to 8 times
 * with exponential backoff, and it refuses to connect to a private,
 * loopback, link-local or metadata address, which it checks again at
 * each delivery. Tests assert on it with {@link expectWebhookSent}.
 *
 * @param event The event type, for example `"ticket.created"`.
 * @param data The event's data. Send only what every endpoint may see.
 *
 * @example
 * ```ts
 * await sendWebhook("ticket.created", { id: ticket.id, subject: ticket.subject });
 * ```
 */
export async function sendWebhook(event: string, data: unknown) {
  const webhookEndpoints = schemaTable("webhook_endpoints");
  const endpoints = await useDb().select({ id: webhookEndpoints.id }).from(webhookEndpoints);

  if (endpoints.length === 0) return;

  const messageId = `msg_${randomUUID()}`;
  const body = JSON.stringify({ type: event, timestamp: now().toISOString(), data });

  for (const endpoint of endpoints) {
    await dispatchAfterCommit(WEBHOOK_JOB_NAME, { endpointId: endpoint.id, messageId, body });
  }
}
