import { afterEach } from "vitest";
import postgres from "postgres";
import { resetTouchedTables } from "./tracking";
import { workerDatabaseUrl } from "./worker";

afterEach(async () => {
  const sql = postgres(workerDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    await resetTouchedTables(sql);
  } finally {
    await sql.end();
  }
});
