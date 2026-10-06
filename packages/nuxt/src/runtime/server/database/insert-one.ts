import type { InferSelectModel } from "drizzle-orm";
import type { PgInsertValue, PgTable } from "drizzle-orm/pg-core";
import { useDb } from "./client";
import { firstOrFail } from "./first-or-fail";

/**
 * Inserts one row and returns it, with its defaults and its generated
 * `id`.
 *
 * Auto-imported on the server. Joins the ambient transaction, like
 * {@link useDb}. `values` is what Drizzle's `.values()` takes for one
 * row. A unique violation throws {@link ConflictError} inside an action
 * or a procedure, like any other write. Write the Drizzle chain for a
 * batch or an upsert. {@link updateOne} is the sibling for an update.
 *
 * @example
 * ```ts
 * const post = await insertOne(postTable, { title: input.title, body: input.body, authorId: user.id });
 * ```
 */
export async function insertOne<T extends PgTable>(table: T, values: PgInsertValue<T>): Promise<InferSelectModel<T>> {
  // drizzle's insert builder cannot resolve the values and returning types of a generic table
  const rows = await useDb()
    .insert(table as PgTable)
    .values(values as Record<string, unknown>)
    .returning();

  // the rows come from the untyped builder above, so they need the select type of T back
  return firstOrFail(rows) as InferSelectModel<T>;
}
