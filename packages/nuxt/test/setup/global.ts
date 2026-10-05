import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { TestProject } from "vitest/node";
import { runMigrations } from "@nuxvel/nuxt/migrations";
import { removeTestRunBuilds } from "../helpers/test-builds";
import { TEST_ADMIN_DATABASE_URL } from "@nuxvel/test-helpers/services";
import { TEMPLATE_DATABASE_NAME } from "./constants";
import { installTrackingTrigger } from "./tracking";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../../playground/server/database/migrations", import.meta.url),
);
const SETUP_FILES = [
  fileURLToPath(new URL("./tracking.ts", import.meta.url)),
  fileURLToPath(import.meta.url),
];

function templateHash() {
  const hash = createHash("sha256");
  const files = readdirSync(MIGRATIONS_FOLDER, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".sql") || file.endsWith(".json"))
    .sort();

  for (const file of files) hash.update(file).update(readFileSync(join(MIGRATIONS_FOLDER, file)));
  for (const file of SETUP_FILES) hash.update(readFileSync(file));

  return hash.digest("hex");
}

async function buildTemplate(hash: string) {
  const adminSql = postgres(TEST_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });

  try {
    await adminSql.unsafe(`drop database if exists ${TEMPLATE_DATABASE_NAME} with (force)`);
    await adminSql.unsafe(`create database ${TEMPLATE_DATABASE_NAME}`);
  } finally {
    await adminSql.end();
  }

  const templateUrl = new URL(TEST_ADMIN_DATABASE_URL);
  templateUrl.pathname = `/${TEMPLATE_DATABASE_NAME}`;
  const templateSql = postgres(templateUrl.toString(), { max: 1, onnotice: () => {} });

  try {
    await installTrackingTrigger(templateSql);
    await runMigrations(templateSql, { migrationsFolder: MIGRATIONS_FOLDER, contract: true });
    await templateSql`truncate table _nuxvel_touched_tables`;
    await templateSql.unsafe(`comment on database ${TEMPLATE_DATABASE_NAME} is '${hash}'`);
  } finally {
    await templateSql.end();
  }
}

export default async function globalSetup(project: TestProject) {
  const runId = randomUUID();

  project.provide("testRunId", runId);
  const hash = templateHash();
  const adminSql = postgres(TEST_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });

  const [template] = await adminSql<{ comment: string | null }[]>`
    select shobj_description(oid, 'pg_database') as comment
    from pg_database where datname = ${TEMPLATE_DATABASE_NAME}
  `;
  await adminSql.end();

  if (template?.comment !== hash) await buildTemplate(hash);

  return () => removeTestRunBuilds(runId);
}
