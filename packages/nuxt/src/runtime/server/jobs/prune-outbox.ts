import { lt, sql } from "drizzle-orm";
import { now } from "../clock/now";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { useNuxvelConfig } from "../utils/config";

/**
 * Deletes the `outbox` rows that reached the queue longer than `after`
 * ago, returning how many it deleted.
 *
 * Auto-imported on the server. The built-in `nuxvel.prune-outbox`
 * schedule runs it daily at 04:30 in `nuxvel queue:work`, so an app
 * rarely calls it. A row that has not reached the queue stays, however
 * old. `after` is a Postgres interval: a value Postgres cannot read as
 * one throws. See {@link relayOutbox}.
 *
 * @param after How long a relayed row stays, e.g. `"7 days"`. Defaults
 * to `nuxvel.queue.outboxRetention`, and to `"7 days"` when that is
 * unset.
 *
 * @example
 * ```ts
 * const deleted = await pruneOutbox("1 day");
 * ```
 */
export async function pruneOutbox(after: string = useNuxvelConfig().queue?.outboxRetention ?? "7 days"): Promise<number> {
  const outbox = schemaTable("outbox");
  const rows = await useDb()
    .delete(outbox)
    .where(lt(outbox.dispatchedAt, sql`${now().toISOString()}::timestamp - ${after}::interval`))
    .returning({ id: outbox.id });

  return rows.length;
}
