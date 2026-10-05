import { eq, getTableName, or, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { UserData } from "./define-user-data";

export type UserDataTable = { name: string; table: PgTable; belongsTo(userId: string): SQL | undefined };

export function userDataTables(declarations: readonly UserData[]): UserDataTable[] {
  const columnsByTable = new Map<PgTable, UserData["column"][]>();

  for (const { table, column } of declarations) {
    columnsByTable.set(table, [...(columnsByTable.get(table) ?? []), column]);
  }

  return [...columnsByTable].map(([table, columns]) => ({
    name: getTableName(table),
    table,
    belongsTo: (userId) => or(...columns.map((column) => eq(column, userId))),
  }));
}
