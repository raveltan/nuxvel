import postgres from "postgres";
import { onTestFinished } from "vitest";

export function scratchSql(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  onTestFinished(() => sql.end());

  return sql;
}
