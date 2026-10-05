import { and, getTableColumns, type InferSelectModel, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { useDb } from "./client";
import { now } from "../clock/now";

/** Any table with the `deletedAt` column that {@link softDeletes} adds. */
export type SoftDeletableTable = PgTable & { deletedAt: PgColumn & { _: { data: Date; notNull: false } } };

/**
 * Which rows a read returns from a table with {@link softDeletes}:
 * only live rows (`"exclude"`), every row (`"include"`), or only
 * trashed rows (`"only"`).
 */
export type Trashed = "exclude" | "include" | "only";

export function trashedScope(table: PgTable, trashed: Trashed): SQL | undefined {
  const deletedAt = getTableColumns(table).deletedAt;

  if (!deletedAt || trashed === "include") return undefined;

  return trashed === "only" ? isNotNull(deletedAt) : isNull(deletedAt);
}

/**
 * A `WHERE` condition that keeps only rows that are not soft-deleted:
 * `deleted_at IS NULL`.
 *
 * Auto-imported on the server. Plain Drizzle queries return trashed
 * rows too; add this condition where a read must hide them.
 *
 * @example
 * ```ts
 * const rows = await useDb().select().from(postsTable).where(and(eq(postsTable.authorId, user.id), notTrashed(postsTable)));
 * ```
 */
export function notTrashed(table: SoftDeletableTable): SQL {
  return isNull(table.deletedAt);
}

/**
 * A `WHERE` condition that keeps only soft-deleted rows:
 * `deleted_at IS NOT NULL`. Auto-imported on the server. The opposite
 * of {@link notTrashed}.
 */
export function onlyTrashed(table: SoftDeletableTable): SQL {
  return isNotNull(table.deletedAt);
}

async function update<T extends SoftDeletableTable>(table: T, deletedAt: Date | null, where: SQL) {
  // drizzle's update builder cannot resolve the set and returning types of a generic table
  const rows = await useDb()
    .update(table as PgTable)
    .set({ deletedAt } as Record<string, unknown>)
    .where(where)
    .returning();

  return rows as InferSelectModel<T>[];
}

/**
 * Soft-deletes the rows that match `where`: sets their `deletedAt` to
 * {@link now}, and returns the rows it changed.
 *
 * Auto-imported on the server. Joins the ambient transaction, like
 * {@link useDb}. Skips rows that are already trashed, so each row keeps
 * the time it was first deleted. Undo it with {@link restore}; delete
 * for good with {@link forceDelete}.
 *
 * @example
 * ```ts
 * const [post] = await softDelete(postsTable, eq(postsTable.id, input.id));
 * ```
 */
export function softDelete<T extends SoftDeletableTable>(table: T, where: SQL): Promise<InferSelectModel<T>[]> {
  return update(table, now(), and(where, notTrashed(table)) ?? where);
}

/**
 * Restores the soft-deleted rows that match `where`: sets their
 * `deletedAt` back to `null`, and returns the rows it changed.
 *
 * Auto-imported on the server. Joins the ambient transaction. Rows that
 * are not trashed are left alone. A restore that breaks a unique index
 * surfaces as {@link ConflictError}, like any other write. The opposite
 * of {@link softDelete}.
 *
 * @example
 * ```ts
 * const [post] = await restore(postsTable, eq(postsTable.id, input.id));
 * ```
 */
export function restore<T extends SoftDeletableTable>(table: T, where: SQL): Promise<InferSelectModel<T>[]> {
  return update(table, null, and(where, onlyTrashed(table)) ?? where);
}

/**
 * Deletes the rows that match `where` for good, trashed or not, and
 * returns them.
 *
 * Auto-imported on the server. Joins the ambient transaction. It is a
 * plain `DELETE`, so foreign keys cascade as usual. Use
 * {@link softDelete} to keep the row.
 *
 * @example
 * ```ts
 * await forceDelete(postsTable, eq(postsTable.id, input.id));
 * ```
 */
export async function forceDelete<T extends SoftDeletableTable>(table: T, where: SQL): Promise<InferSelectModel<T>[]> {
  // drizzle's delete builder cannot resolve the returning type of a generic table
  const rows = await useDb().delete(table as PgTable).where(where).returning();

  return rows as InferSelectModel<T>[];
}
