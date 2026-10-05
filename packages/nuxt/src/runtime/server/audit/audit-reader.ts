import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useDb } from "../database/client";

export type AuditReader = Pick<PostgresJsDatabase, "select">;

export async function withAuditReader<T>(read: (db: AuditReader) => Promise<T>): Promise<T> {
  const ownerUrl = process.env.NUXT_DATABASE_OWNER_URL;

  if (!ownerUrl || ownerUrl === process.env.NUXT_DATABASE_URL) return read(useDb());

  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });

  try {
    return await read(drizzle(sql));
  } finally {
    await sql.end();
  }
}
