import { z } from "zod";
import type { RecordedJob } from "../../runtime/server/testing/recorders";
import { recordedEffects } from "../recorded";
import { expectNotRecorded, expectRecorded, includes } from "./records";

const sentWebhook = z.looseObject({ type: z.string(), timestamp: z.string(), data: z.unknown() });
type SentWebhook = z.infer<typeof sentWebhook>;
type WebhookMatch = { data?: object; endpoint?: number };
const webhookPayload = z.object({ endpointId: z.number(), messageId: z.string(), body: z.string() });

function sentWebhooks(dispatched: RecordedJob[], type: string | undefined, endpoint: number | undefined) {
  const seen = new Set<string>();
  const sent: SentWebhook[] = [];

  for (const { name, payload } of dispatched) {
    if (name !== "nuxvel.webhook") continue;

    const { endpointId, messageId, body } = webhookPayload.parse(payload);
    if (endpoint !== undefined && endpointId !== endpoint) continue;

    const message = sentWebhook.parse(JSON.parse(body));
    if (type !== undefined && message.type !== type) continue;
    if (endpoint === undefined && seen.has(messageId)) continue;

    seen.add(messageId);
    sent.push(message);
  }

  return sent;
}

/**
 * Asserts that {@link sendWebhook} sent an event of type `type` during the
 * test, with a `data` whose fields include `match.data`.
 *
 * It reads the `nuxvel.webhook` jobs that the send dispatched after its
 * transaction committed, so a rolled-back send records nothing. One event
 * counts once, however many endpoints get it, unless `match.endpoint`
 * names one endpoint. Nothing is delivered until a test runs the job
 * with `runJob()`. The opposite is {@link expectNoWebhookSent}.
 *
 * @param match.data Top-level fields of the event data.
 * @param match.endpoint The ID of one webhook endpoint that must get the event.
 * @param options.times How many matching events there must be, 1 or more.
 * @returns The `{ type, timestamp, data }` body of the latest matching event.
 *
 * @example
 * ```ts
 * const { data } = await expectWebhookSent("ticket.created", { data: { id: ticket.id } });
 * ```
 */
export async function expectWebhookSent(
  type: string,
  match: WebhookMatch = {},
  options: { times?: number } = {},
): Promise<SentWebhook> {
  const { dispatched } = await recordedEffects();
  const matchesData = includes(match.data);

  return expectRecorded(
    "expectWebhookSent",
    `a "${type}" webhook with ${JSON.stringify(match)}`,
    sentWebhooks(dispatched, undefined, match.endpoint),
    (sent) => sent.type === type && matchesData(sent.data),
    options.times,
  );
}

/**
 * Asserts that {@link sendWebhook} sent no event during the test. With
 * `type`, it asserts that no event of that type was sent. The opposite
 * of {@link expectWebhookSent}.
 *
 * @example
 * ```ts
 * await expectNoWebhookSent("ticket.created");
 * ```
 */
export async function expectNoWebhookSent(type?: string): Promise<void> {
  const { dispatched } = await recordedEffects();

  expectNotRecorded("expectNoWebhookSent", `a webhook${type === undefined ? "" : ` of type "${type}"`}`, sentWebhooks(dispatched, type, undefined), () => true);
}
