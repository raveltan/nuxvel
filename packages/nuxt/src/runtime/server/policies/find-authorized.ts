import type { InferSelectModel } from "drizzle-orm";
import { findRow, type IdentifiableTable, type TableId } from "../database/find-or-fail";
import type { SoftDeletableTable, Trashed } from "../database/soft-deletes";
import { authorize } from "./authorize";
import type { PolicyAction } from "./can";

/**
 * Loads one row by primary key and authorizes `action` on it for the
 * current actor, then returns the row.
 *
 * Auto-imported on the server. Throws {@link NotFoundError} (HTTP 404)
 * when no row has that id, and {@link ForbiddenError} (HTTP 403) when the
 * policy denies the action. It is {@link findOrFail} followed by
 * {@link authorize}, so it reads the ambient actor and takes the same
 * `opts.trashed`.
 *
 * @param action A rule of the table's policy ({@link PolicyAction}).
 * @param opts.trashed Only for a table with {@link softDeletes}, as in
 * {@link findOrFail}: `"only"` finds a trashed row to restore.
 *
 * @example
 * ```ts
 * const post = await findAuthorized(postTable, input.id, "update");
 * const trashed = await findAuthorized(postTable, input.id, "restore", { trashed: "only" });
 * ```
 */
export async function findAuthorized<T extends IdentifiableTable>(
  table: T,
  id: TableId<T>,
  action: PolicyAction<T>,
  opts?: T extends SoftDeletableTable ? { trashed?: Trashed } : never,
): Promise<InferSelectModel<T>> {
  const row = await findRow(table, id, opts?.trashed ?? "exclude");

  await authorize(action, table, row);

  return row;
}
