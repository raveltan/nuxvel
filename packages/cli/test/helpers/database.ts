import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { TEST_ADMIN_DATABASE_URL } from "@nuxvel/test-helpers/services";
import { onTestFinished } from "vitest";

async function dropDatabases(names: string[]) {
  const sql = postgres(TEST_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    for (const name of names) await sql.unsafe(`drop database if exists "${name}" with (force)`);
  } finally {
    await sql.end();
  }
}

export async function createDatabase(label: string) {
  const name = `nuxvel_${label.replaceAll("-", "_")}_${randomUUID().slice(0, 8)}`;
  const sql = postgres(TEST_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });

  try {
    await sql.unsafe(`create database "${name}"`);
  } finally {
    await sql.end();
  }

  const url = new URL(TEST_ADMIN_DATABASE_URL);
  url.pathname = `/${name}`;

  return { url: url.toString(), drop: () => dropDatabases([name, `${name}_test`]) };
}

export async function scratchDatabase(label: string) {
  const database = await createDatabase(label);

  onTestFinished(database.drop);

  return database.url;
}
