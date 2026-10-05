import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll } from "vitest";

export function useTestDatabase() {
  const sql = postgres(process.env.NUXT_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });

  afterAll(() => sql.end());

  return drizzle(sql);
}
