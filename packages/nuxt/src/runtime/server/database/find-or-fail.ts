import { and, eq, type InferSelectModel } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { NotFoundError } from "../errors/taxonomy";
import { useDb } from "./client";
import { type SoftDeletableTable, type Trashed, trashedScope } from "./soft-deletes";

/** Any table with an `id` column, which is what {@link findOrFail} needs. */
export type IdentifiableTable = PgTable & { id: PgColumn };

/** The value type of a table's `id` column: `number` for `serial`, `string` for `text`. */
export type TableId<T extends IdentifiableTable> = T["id"]["_"]["data"];

export async function findRow<T extends IdentifiableTable>(
  table: T,
  id: TableId<T>,
  trashed: Trashed,
): Promise<InferSelectModel<T>> {
  // drizzle's .from() guard is a conditional type that never resolves for a generic table
  const [row] = await useDb()
    .select()
    .from(table as PgTable)
    .where(and(eq(table.id, id), trashedScope(table, trashed)));

  if (!row) throw new NotFoundError(`Row ${id} not found`);

  return row as InferSelectModel<T>;
}

/**
 * Loads one row by primary key, or throws {@link NotFoundError} — which
 * tRPC surfaces as a 404.
 *
 * Auto-imported on the server. `id` is typed from the table's `id`
 * column, so a text-keyed table takes a string. On a table with
 * {@link softDeletes}, a trashed row counts as not found unless
 * `opts.trashed` says otherwise.
 *
 * @param opts.trashed Only for a table with {@link softDeletes}:
 * `"exclude"` (the default) skips a trashed row, `"include"` finds it
 * either way, `"only"` finds it only when it is trashed.
 *
 * @example
 * ```ts
 * const post = await findOrFail(postsTable, input.id);
 * const trashed = await findOrFail(postsTable, input.id, { trashed: "only" });
 * ```
 */
export function findOrFail<T extends IdentifiableTable>(
  table: T,
  id: TableId<T>,
  opts?: T extends SoftDeletableTable ? { trashed?: Trashed } : never,
): Promise<InferSelectModel<T>> {
  return findRow(table, id, opts?.trashed ?? "exclude");
}
