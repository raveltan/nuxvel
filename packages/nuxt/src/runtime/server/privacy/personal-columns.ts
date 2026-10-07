import { getTableColumns, getTableName } from "drizzle-orm";
import userData from "#nuxvel/user-data";
import type { UserData } from "./define-user-data";

export function personalColumnKeys(tableName: string): Set<string> {
  const declarations: readonly UserData[] = userData;
  const keys = new Set<string>();

  for (const { table, personal } of declarations) {
    if (getTableName(table) !== tableName) continue;

    for (const [key, column] of Object.entries(getTableColumns(table))) {
      if (personal.includes(column)) keys.add(key);
    }
  }

  return keys;
}
