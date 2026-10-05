import { inArray, isNull } from "drizzle-orm";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { transaction } from "../database/transaction";
import { enqueueJob } from "./enqueue";
import { findJob } from "./registry";
import { now } from "../clock/now";

const RELAY_BATCH_SIZE = 100;

/**
 * Adds every un-dispatched `outbox` row to its job's queue, marks it
 * dispatched and clears its payload, returning how many rows it relayed.
 *
 * Auto-imported on the server. `nuxvel queue:work` calls it when a
 * dispatch's `NOTIFY` arrives and every second,
 * so an app never calls it itself — reach for it in a test that needs the
 * rows {@link dispatchAfterCommit} wrote to reach the queue now. A crash
 * between the enqueue and the mark re-enqueues the row on the next run,
 * so job handlers must stay safe to run twice.
 *
 * Rows are claimed with `select ... for update skip locked`, so two
 * workers relaying at the same time never enqueue the same row twice and
 * neither waits on the other.
 *
 * @example
 * ```ts
 * await relayOutbox();
 * const waiting = await useQueue().getWaiting();
 * ```
 */
export async function relayOutbox(): Promise<number> {
  const outbox = schemaTable("outbox");

  return await transaction(async () => {
    const rows = await useDb()
      .select()
      .from(outbox)
      .where(isNull(outbox.dispatchedAt))
      .orderBy(outbox.id)
      .limit(RELAY_BATCH_SIZE)
      .for("update", { skipLocked: true });

    if (rows.length === 0) return 0;

    for (const row of rows) {
      await enqueueJob({
        queue: findJob(row.jobName)?.queue ?? "default",
        name: row.jobName,
        payload: row.payload,
        options: { delay: row.delay ?? undefined, priority: row.priority ?? undefined },
      });
    }

    await useDb()
      .update(outbox)
      .set({ dispatchedAt: now(), payload: null })
      .where(
        inArray(
          outbox.id,
          rows.map((row) => row.id),
        ),
      );

    return rows.length;
  });
}
