import { getTableColumns, getTableName, is, lt, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "#nuxvel/schema";
import { useNuxvelConfig } from "../utils/config";
import { useDb } from "./client";
import { now } from "../clock/now";

/**
 * Deletes, for good, the rows that were soft-deleted longer than
 * `after` ago, in every schema table with {@link softDeletes}. Returns
 * how many rows each table lost, keyed by table name.
 *
 * Auto-imported on the server. When `nuxvel.database.purgeTrashedAfter`
 * is set, the built-in `nuxvel.purge-trashed` schedule runs it daily in
 * `nuxvel queue:work`. Without an `after`, it deletes nothing. `after`
 * is a Postgres interval: a value Postgres cannot read as one throws.
 * Each table is one `DELETE`, so foreign keys cascade as usual.
 *
 * @param after How long a trashed row stays, e.g. `"30 days"`. Defaults
 * to `nuxvel.database.purgeTrashedAfter`.
 *
 * @example
 * ```ts
 * const purged = await purgeTrashed("30 days");
 * // { posts: 3 }
 * ```
 */
export async function purgeTrashed(
  after: string | undefined = useNuxvelConfig().database?.purgeTrashedAfter,
): Promise<Record<string, number>> {
  const purged: Record<string, number> = {};

  if (!after) return purged;

  const exports: unknown[] = Object.values(schema);

  for (const table of exports) {
    if (!is(table, PgTable)) continue;

    const deletedAt = getTableColumns(table).deletedAt;

    if (!deletedAt) continue;

    const rows = await useDb()
      .delete(table)
      .where(lt(deletedAt, sql`${now().toISOString()}::timestamptz - ${after}::interval`))
      .returning({ deletedAt });

    purged[getTableName(table)] = rows.length;
  }

  return purged;
}
