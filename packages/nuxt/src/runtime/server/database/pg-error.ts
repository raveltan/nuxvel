import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import * as schema from "#nuxvel/schema";
import type { PgError } from "./find-pg-error";

const SINGLE_COLUMN_KEY = /^Key \(([^,()]+)\)=/;

export function singleColumnKey({ detail, table_name }: PgError): string | undefined {
  const column = typeof detail === "string" ? SINGLE_COLUMN_KEY.exec(detail)?.[1] : undefined;
  const table = Object.values(schema).find(
    (candidate) => isTable(candidate) && getTableName(candidate) === table_name,
  );

  if (!column || !isTable(table)) return undefined;

  return Object.entries(getTableColumns(table)).find(([, { name }]) => name === column)?.[0];
}
