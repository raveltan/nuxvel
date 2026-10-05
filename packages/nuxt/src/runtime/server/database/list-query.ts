import { and, asc, desc, eq, getTableColumns, getTableName, inArray, sql, type Column, type SQL, type Table } from "drizzle-orm";
import type { DateRange, ListSort } from "../../shared/pagination/list-query";

type ColumnKey<TTable extends Table> = keyof TTable["_"]["columns"] & string;
type OnlyColumns<TTable extends Table, TKeys extends string> = Exclude<TKeys, ColumnKey<TTable>> extends never ? unknown : never;
type FilterValue = string | boolean | string[] | DateRange;

function tableColumn(table: Table, key: string): Column {
  const column = getTableColumns(table)[key];

  if (!column) throw new Error(`"${key}" is not a column of the table ${getTableName(table)}`);

  return column;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function condition(column: Column, value: FilterValue): SQL | undefined {
  if (typeof value === "string") return sql`${column}::text ilike ${`%${escapeLike(value)}%`}`;
  if (typeof value === "boolean") return eq(column, value);
  if (Array.isArray(value)) return inArray(column, value);

  return and(
    value.from === undefined ? undefined : sql`${column} >= ${value.from}::date`,
    value.to === undefined ? undefined : sql`${column} < ${value.to}::date + 1`,
  );
}

/**
 * Returns the `where` condition of the active filters of a
 * {@link listQuery}, or `undefined` when no filter is set.
 *
 * Auto-imported on the server. Each filter key is a column key of
 * `table`. A text filter matches the column as text, case-insensitive,
 * anywhere in the value, with `%` and `_` matched literally. A select
 * matches any of its values. A date range includes both ends, in the
 * database's time zone. Values go to Postgres as parameters. Combine it
 * with other conditions through `and()`, which skips `undefined`. A key
 * that is not a column is a type error, and throws at runtime.
 *
 * @example
 * ```ts
 * useDb().select().from(taskTable).where(and(listWhere(taskTable, input.filters), notTrashed(taskTable)))
 * ```
 */
export function listWhere<TTable extends Table, TFilters extends Record<string, FilterValue | undefined>>(
  table: TTable,
  filters: TFilters & OnlyColumns<TTable, keyof TFilters & string>,
): SQL | undefined {
  const conditions = Object.entries(filters).flatMap(([key, value]) =>
    value === undefined ? [] : [condition(tableColumn(table, key), value)],
  );

  return conditions.length === 0 ? undefined : and(...conditions);
}

/**
 * Returns the `orderBy` terms of the sort of a {@link listQuery}, in
 * order. An empty sort returns no terms.
 *
 * Auto-imported on the server. Each sort column is a column key of
 * `table`. Spread the terms first and end with a unique column, such as
 * `id`, so that a row stays on one page. A column that is not a column
 * of `table` is a type error, and throws at runtime.
 *
 * @example
 * ```ts
 * .orderBy(...listOrderBy(taskTable, input.sort), desc(taskTable.id))
 * ```
 */
export function listOrderBy<TTable extends Table, TColumn extends string>(
  table: TTable,
  sort: ListSort<TColumn>[] & OnlyColumns<TTable, TColumn>,
): SQL[] {
  return sort.map(({ column, direction }) => (direction === "asc" ? asc : desc)(tableColumn(table, column)));
}
