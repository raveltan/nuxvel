import { and, asc, gt, type InferSelectModel, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { useDb } from "./client";
import type { IdentifiableTable, TableId } from "./find-or-fail";

/**
 * Walks the rows of `table` in `id` order, `size` rows at a time, and
 * calls `fn` with each chunk.
 *
 * Auto-imported on the server. Use it in a job or a listener that must
 * read a large table: each chunk is one query that starts after the
 * last `id` of the previous chunk, so rows added or changed during the
 * walk do not shift the pages. `fn` runs in the caller's transaction,
 * if there is one. Trashed rows are included unless `opts.where`
 * excludes them. Throws when `size` is not a positive integer.
 *
 * @param opts.where Restricts the walk to matching rows.
 *
 * @example
 * ```ts
 * await chunkById(postsTable, 500, async (rows) => {
 *   await reindex(rows);
 * }, { where: notTrashed(postsTable) });
 * ```
 */
export async function chunkById<T extends IdentifiableTable>(
  table: T,
  size: number,
  fn: (rows: InferSelectModel<T>[]) => Promise<unknown>,
  opts?: { where?: SQL },
): Promise<void> {
  if (!Number.isInteger(size) || size < 1) throw new Error(`chunkById: size must be a positive integer, got ${size}`);

  let after: TableId<T> | undefined;

  for (;;) {
    // drizzle's .from() guard is a conditional type that never resolves for a generic table
    const rows = (await useDb()
      .select()
      .from(table as PgTable)
      .where(and(opts?.where, after === undefined ? undefined : gt(table.id, after)))
      .orderBy(asc(table.id))
      .limit(size)) as InferSelectModel<T>[];
    const last = rows.at(-1);

    if (!last) return;

    await fn(rows);

    if (rows.length < size) return;

    after = last.id;
  }
}
