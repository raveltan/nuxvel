import userData from "#nuxvel/user-data";
import { useDb } from "../database/client";
import type { UserData } from "./define-user-data";
import { userDataTables } from "./user-data-tables";

const declarations: readonly UserData[] = userData;

/**
 * Collects every row declared as the user's personal data with
 * {@link defineUserData}, keyed by table name.
 *
 * Auto-imported on the server; `nuxvel user:export <id>` prints it as
 * JSON. A declared table with no rows for the user is still listed, empty;
 * a table declared more than once is listed once, with the rows matching
 * any of its declared columns.
 *
 * @example
 * ```ts
 * const archive = await exportUserData(user.id);
 * // { user: [{ id, name, email, ... }], posts: [...] }
 * ```
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown[]>> {
  const archive: Record<string, unknown[]> = {};

  for (const { name, table, belongsTo } of userDataTables(declarations)) {
    archive[name] = await useDb().select().from(table).where(belongsTo(userId));
  }

  return archive;
}
