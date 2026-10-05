import postgres from "postgres";
import { TEST_ADMIN_DATABASE_URL } from "@nuxvel/test-helpers/services";
import { TEMPLATE_DATABASE_NAME } from "./constants";

export function workerDatabaseName() {
  return `worker_${process.env.VITEST_POOL_ID ?? "0"}`;
}

export function workerDatabaseUrl() {
  const url = new URL(TEST_ADMIN_DATABASE_URL);
  url.pathname = `/${workerDatabaseName()}`;
  return url.toString();
}

export async function setupWorkerDatabase() {
  const databaseName = workerDatabaseName();
  const sql = postgres(TEST_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });

  await sql.unsafe(`drop database if exists ${databaseName} with (force)`);
  await sql.unsafe(
    `create database ${databaseName} template ${TEMPLATE_DATABASE_NAME}`,
  );

  await sql.end();

  process.env.NUXT_DATABASE_URL = workerDatabaseUrl();
  process.env.NUXT_AUTH_SECRET ??= "nuxvel-test-auth-secret-000000000000";
  process.env.NUXT_AUDIT_CHAIN_SECRET ??= "nuxvel-test-audit-chain-secret-00000000";
}

await setupWorkerDatabase();
