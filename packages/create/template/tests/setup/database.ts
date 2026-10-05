import { existsSync } from "node:fs";
import { runMigrations } from "@nuxvel/nuxt/migrations";
import postgres from "postgres";

function testDatabaseUrl(url: string) {
  const testUrl = new URL(url);
  testUrl.pathname = `${testUrl.pathname}_test`;
  return testUrl.toString();
}

export default async function setupTestDatabase() {
  if (existsSync(".env")) process.loadEnvFile(".env");

  const ownerUrl = process.env.NUXT_DATABASE_OWNER_URL;
  if (!ownerUrl) throw new Error("NUXT_DATABASE_OWNER_URL is not set: copy .env.example to .env");

  const databaseUrl = testDatabaseUrl(ownerUrl);
  const databaseName = new URL(databaseUrl).pathname.slice(1);

  const adminSql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  await adminSql.unsafe(`drop database if exists "${databaseName}" with (force)`);
  await adminSql.unsafe(`create database "${databaseName}"`);
  await adminSql.end();

  const sql = postgres(databaseUrl, { max: 1 });
  await runMigrations(sql, { migrationsFolder: "server/database/migrations", contract: true });
  await sql.end();

  process.env.NUXT_DATABASE_URL = databaseUrl;
  process.env.NUXT_DATABASE_OWNER_URL = databaseUrl;
}
