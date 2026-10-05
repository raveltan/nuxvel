import webhooks from "#nuxvel/webhooks";
import { type Defined, resolveName } from "../discovery/aliases";
import type { Renamed } from "../discovery/renamed";
import type { Webhook } from "./define-webhook";

/**
 * The name of every webhook defined under `server/webhooks/`: its
 * file's path, served at `POST /api/webhooks/<name>`.
 */
export type WebhookName = Defined<(typeof webhooks)[number]>["name"];

function entries(): readonly (Webhook | Renamed<Webhook>)[] {
  return webhooks;
}

/**
 * The discovered webhook with this name, or with an old name a
 * {@link renamed} alias keeps, or `undefined` when no file under
 * `server/webhooks/` defines one.
 *
 * The `POST /api/webhooks/<name>` endpoint
 * uses it to find the webhook to run; see {@link defineWebhook}.
 */
export function findWebhook(name: string): Webhook | undefined {
  return resolveName(entries(), name);
}
