import { and, asc, eq, getTableColumns, gt, sql } from "drizzle-orm";
import { useDb } from "../database/client";
import { firstOrFail } from "../database/first-or-fail";
import { schemaTable } from "../database/schema-table";
import { transaction } from "../database/transaction";
import type { Backfill } from "./define-backfill";
import type { BackfillName } from "./backfill-name";
import { backfillStoredName, findBackfill } from "./registry";
import { now } from "../clock/now";

function primaryKeyOf(backfill: Backfill) {
  const keys = Object.entries(getTableColumns(backfill.table)).filter(
    ([, column]) => column.primary,
  );
  const [key] = keys;

  if (!key || keys.length > 1) {
    throw new Error(
      `Backfill "${backfill.name}" needs a table with a single-column primary key`,
    );
  }

  const [property, column] = key;

  return { property, column };
}

async function startBackfill(backfill: Backfill, stored: string) {
  const backfills = schemaTable("backfills");
  const total = await useDb().$count(backfill.table, backfill.where);

  await useDb()
    .insert(backfills)
    .values({ name: stored, total })
    .onConflictDoNothing({ target: backfills.name });
}

/**
 * Runs a backfill, given by its name or its definition
 * (`$backfills.postsContent` or an import), to completion, one batch per
 * transaction, picking up after the last batch a previous run committed.
 *
 * Auto-imported on the server. Call it from a job, a Nitro task or
 * `nuxvel tinker`. Two runs of the same backfill at once take turns
 * batch by batch rather than processing a row twice. Running a finished
 * backfill again does nothing. A backfill a {@link renamed} alias keeps
 * an old name for goes on with the cursor stored under that name.
 *
 * `backfill` is a {@link BackfillName}, so a misspelled one fails to
 * compile, or the backfill's definition. Throws when no backfill has this name, and rethrows whatever a batch's
 * handler throws, after that batch has rolled back.
 *
 * @example
 * ```ts
 * await runBackfill("posts-content");
 * await runBackfill($backfills.postsContent);
 * ```
 */
export async function runBackfill(nameOrBackfill: BackfillName | Backfill): Promise<void> {
  const name = typeof nameOrBackfill === "string" ? nameOrBackfill : nameOrBackfill.name;
  const backfill = findBackfill(name);

  if (!backfill) throw new Error(`No backfill named "${name}"`);

  const primaryKey = primaryKeyOf(backfill);
  const stored = backfillStoredName(backfill);

  await startBackfill(backfill, stored);

  const backfills = schemaTable("backfills");
  let finished = false;

  while (!finished) {
    finished = await transaction(async () => {
      const state = await useDb()
        .select()
        .from(backfills)
        .where(eq(backfills.name, stored))
        .for("update")
        .then(firstOrFail);

      if (state.completedAt) return true;

      const rows = await useDb()
        .select()
        .from(backfill.table)
        .where(
          and(
            backfill.where,
            state.cursor === null
              ? undefined
              : gt(primaryKey.column, state.cursor),
          ),
        )
        .orderBy(asc(primaryKey.column))
        .limit(backfill.batchSize);

      const last = rows.at(-1);

      if (!last) {
        await useDb()
          .update(backfills)
          .set({ completedAt: now(), updatedAt: now() })
          .where(eq(backfills.name, stored));

        return true;
      }

      await backfill.handler(rows);

      await useDb()
        .update(backfills)
        .set({
          cursor: last[primaryKey.property],
          processed: sql`${backfills.processed} + ${rows.length}`,
          updatedAt: now(),
        })
        .where(eq(backfills.name, stored));

      return false;
    });
  }
}
