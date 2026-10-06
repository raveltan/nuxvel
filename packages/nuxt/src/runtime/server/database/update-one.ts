import { and, eq, type InferSelectModel } from "drizzle-orm";
import type { PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { NotFoundError } from "../errors/taxonomy";
import { useDb } from "./client";
import type { IdentifiableTable, TableId } from "./find-or-fail";
import { trashedScope } from "./soft-deletes";

/**
 * Updates one row by primary key with `values`, and returns the updated
 * row.
 *
 * Auto-imported on the server. Throws {@link NotFoundError} (HTTP 404)
 * when no row has that id. On a table with {@link softDeletes}, a
 * trashed row counts as not found, as with {@link findOrFail}. Joins the
 * ambient transaction, like {@link useDb}. `values` is what Drizzle's
 * `.set()` takes, so it must name at least one column. Write the Drizzle
 * chain for any other update. {@link insertOne} is the sibling for an
 * insert.
 *
 * @example
 * ```ts
 * const post = await updateOne(postTable, input.id, { title: input.title });
 * ```
 */
export async function updateOne<T extends IdentifiableTable>(
  table: T,
  id: TableId<T>,
  values: PgUpdateSetSource<T>,
): Promise<InferSelectModel<T>> {
  // drizzle's update builder cannot resolve the set and returning types of a generic table
  const [row] = await useDb()
    .update(table as PgTable)
    .set(values as Record<string, unknown>)
    .where(and(eq(table.id, id), trashedScope(table, "exclude")))
    .returning();

  if (!row) throw new NotFoundError(`Row ${id} not found`);

  return row as InferSelectModel<T>;
}
