import { and, desc, eq, getTableColumns, type InferSelectModel, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { expect } from "vitest";
import type { SoftDeletableTable } from "../runtime/server/database/soft-deletes";
import { testDatabase } from "./database";

function conditionsFor(table: PgTable, match: Record<string, unknown>) {
  const columns = getTableColumns(table);

  return Object.entries(match).map(([key, value]): SQL => {
    const column = columns[key];

    if (!column) throw new Error(`expectRow: the table has no column named "${key}"`);

    return value === null ? isNull(column) : eq(column, value);
  });
}

async function findRow(table: PgTable, match: Record<string, unknown>, extra?: SQL) {
  const [row] = await testDatabase()
    .select()
    .from(table)
    .where(and(...conditionsFor(table, match), extra))
    .limit(1);

  return row;
}

async function closestRows(table: PgTable, match: Record<string, unknown>, extra?: SQL) {
  const conditions = conditionsFor(table, match);
  const matched = sql.join(
    conditions.map((condition) => sql`coalesce((${condition})::int, 0)`),
    sql` + `,
  );
  const query = testDatabase().select().from(table).where(extra);
  const rows = await (conditions.length === 0 ? query : query.orderBy(desc(matched))).limit(3);

  if (rows.length === 0) return "The table has no rows.";

  const shown = rows.map((row) => JSON.stringify(Object.fromEntries(Object.keys(match).map((key) => [key, (row as Record<string, unknown>)[key]]))));

  return `Closest rows: ${shown.join(", ")}`;
}

async function assertRow<Table extends PgTable>(
  helper: string,
  kind: string,
  table: Table,
  match: Partial<InferSelectModel<Table>>,
  extra?: SQL,
): Promise<InferSelectModel<Table>> {
  const row = await findRow(table, match, extra);

  if (!row) throw new Error(`${helper}: no ${kind}row matches ${JSON.stringify(match)}. ${await closestRows(table, match, extra)}`);

  // columns are walked by name, so the row is only known to fit the table at runtime
  return row as InferSelectModel<Table>;
}

/**
 * Asserts a row of `table` matching every column in `match` exists, and
 * returns it as the table's select type. On failure, it shows the rows
 * that match the most columns of `match`.
 *
 * Reads on the test's own connection, outside any transaction the app
 * has open, so it sees committed state only. `null` matches `IS NULL`.
 *
 * @example
 * ```ts
 * const row = await expectRow(postsTable, { id: post.id, title: "Hello" });
 * ```
 */
export async function expectRow<Table extends PgTable>(
  table: Table,
  match: Partial<InferSelectModel<Table>>,
): Promise<InferSelectModel<Table>> {
  return assertRow("expectRow", "", table, match);
}

/**
 * Asserts a soft-deleted row of `table` (its `deletedAt` is set) matches
 * every column in `match`, and returns it.
 *
 * Takes only a table with {@link softDeletes}; another table fails to
 * compile. Uses the matching rules of {@link expectRow}. Use
 * {@link expectNoRow} to assert that a row is gone for good.
 *
 * @example
 * ```ts
 * await api.post.delete({ id: post.id });
 * await expectSoftDeleted(postsTable, { id: post.id });
 * ```
 */
export async function expectSoftDeleted<Table extends SoftDeletableTable>(
  table: Table,
  match: Partial<InferSelectModel<Table>>,
): Promise<InferSelectModel<Table>> {
  return assertRow("expectSoftDeleted", "soft-deleted ", table, match, isNotNull(table.deletedAt));
}

/**
 * Asserts no row of `table` matches every column in `match`. The
 * opposite of {@link expectRow}, with the same matching rules.
 *
 * @example
 * ```ts
 * await api.post.delete({ id: post.id });
 * await expectNoRow(postsTable, { id: post.id });
 * ```
 */
export async function expectNoRow<Table extends PgTable>(
  table: Table,
  match: Partial<InferSelectModel<Table>>,
): Promise<void> {
  const row = await findRow(table, match);

  expect(row, `a row matches ${JSON.stringify(match)}`).toBeUndefined();
}

/**
 * Asserts `table` holds exactly `n` rows that match every column in
 * `match`, or `n` rows in total without `match`. Uses the matching
 * rules of {@link expectRow}.
 *
 * @example
 * ```ts
 * await expectCount(commentsTable, 3, { postId: post.id });
 * ```
 */
export async function expectCount<Table extends PgTable>(
  table: Table,
  n: number,
  match: Partial<InferSelectModel<Table>> = {},
): Promise<void> {
  const rows = await testDatabase().$count(table, and(...conditionsFor(table, match)));

  expect(rows, `rows that match ${JSON.stringify(match)}`).toBe(n);
}
