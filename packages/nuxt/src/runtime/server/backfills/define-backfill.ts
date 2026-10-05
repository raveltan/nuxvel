import type { SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { awaitingName } from "../discovery/definition-name";

/** A backfill definition: the table it walks, which rows, and the work done per batch. */
export interface Backfill<Table extends PgTable = PgTable, Name extends string = string> {
  name: Name;
  table: Table;
  batchSize: number;
  where?: SQL;
  handler(rows: Table["$inferSelect"][]): Promise<void>;
}

/**
 * Defines a backfill: a resumable data migration that walks a table in
 * primary-key order, one batch at a time.
 *
 * `defineBackfill` is auto-imported. One backfill per file, under
 * `server/database/backfills/`; the file is discovered, so nothing
 * registers it, and its path is the backfill's name
 * (`server/database/backfills/posts-content.backfill.ts` is `"posts-content"`):
 * what {@link runBackfill} and `nuxvel backfill:status` take, and the key
 * its cursor is stored under. It is part of {@link BackfillName}, so
 * running a misspelled name fails to compile. {@link renamed} at the old
 * path keeps a moved one on its stored cursor.
 *
 * Each batch runs in its own transaction together with the write that
 * advances the backfill's cursor in the `backfills` table, so a crash or
 * a deploy mid-run loses at most the batch in flight, and the next run
 * resumes after the last committed one. The table needs a single-column
 * primary key.
 *
 * @param config.table The Drizzle table to walk.
 * @param config.batchSize How many rows each batch hands to `handler`; a
 * positive integer, or `defineBackfill` throws.
 * @param config.where Restricts the walk to matching rows. Rows are
 * counted against it once, when the backfill first starts, to give the
 * total `backfill:status` reports.
 * @param config.handler The work for one batch. `useDb()` inside it joins
 * the batch's transaction; a throw rolls the batch back and leaves the
 * cursor where it was.
 *
 * @example
 * ```ts
 * // server/database/backfills/posts-content.backfill.ts
 * export const postsContentBackfill = defineBackfill({
 *   table: postsTable,
 *   batchSize: 1_000,
 *   where: isNull(postsTable.content),
 *   async handler(rows) {
 *     for (const row of rows) {
 *       await useDb().update(postsTable).set({ content: row.body }).where(eq(postsTable.id, row.id));
 *     }
 *   },
 * });
 * ```
 */
export function defineBackfill<Table extends PgTable>(
  config: Omit<Backfill<Table>, "name">,
): Backfill<Table> {
  if (!Number.isInteger(config.batchSize) || config.batchSize < 1) {
    throw new Error(
      `defineBackfill: batchSize must be a positive integer, got ${config.batchSize}.`,
    );
  }

  return awaitingName({ name: "", ...config }, "backfill");
}
