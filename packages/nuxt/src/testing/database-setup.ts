/**
 * Vitest setup file that gives each test file a clean copy of the test
 * database and its own Redis database. List it in `setupFiles`, before
 * `@nuxvel/nuxt/testing/setup`.
 *
 * Before the file runs, it copies the migrated `<database>_test` database
 * to `<database>_test_<VITEST_POOL_ID>`, and points `NUXT_DATABASE_URL`
 * and `NUXT_DATABASE_OWNER_URL` at the copy. The server that
 * `@nuxvel/nuxt/testing/setup` starts uses the copy. After each test, it empties every table in the
 * `public` schema. After the file, it drops the copy. Throws when
 * `NUXT_DATABASE_OWNER_URL` does not point at a `_test` database.
 *
 * It also adds `VITEST_POOL_ID` to the database index in `NUXT_REDIS_URL`,
 * and runs `FLUSHDB` on that Redis database before the file and after each
 * test. Throws when Redis does not have a database with that index.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   test: {
 *     globalSetup: ["./tests/setup/database.ts", "@nuxvel/nuxt/testing/global-setup"],
 *     setupFiles: ["@nuxvel/nuxt/testing/database", "@nuxvel/nuxt/testing/setup"],
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */
import { Redis } from "ioredis";
import postgres from "postgres";
import { afterAll, afterEach } from "vitest";

const templateUrl = new URL(process.env.NUXT_DATABASE_OWNER_URL ?? "");
const template = templateUrl.pathname.slice(1);

if (!template.endsWith("_test")) {
  throw new Error(
    `nuxvel testing: NUXT_DATABASE_OWNER_URL must point at the <database>_test database, not "${template}". Put the database global setup in vitest's globalSetup.`,
  );
}

const clone = `${template}_${process.env.VITEST_POOL_ID ?? "0"}`;
const adminUrl = new URL(templateUrl);
adminUrl.pathname = `/${template.slice(0, -"_test".length)}`;
const cloneUrl = new URL(templateUrl);
cloneUrl.pathname = `/${clone}`;

async function onAdmin(statement: string) {
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(statement);
  } finally {
    await admin.end();
  }
}

await onAdmin(`drop database if exists "${clone}" with (force)`);
await onAdmin(`create database "${clone}" template "${template}"`);
process.env.NUXT_DATABASE_URL = cloneUrl.toString();
process.env.NUXT_DATABASE_OWNER_URL = cloneUrl.toString();

const redisUrl = new URL(process.env.NUXT_REDIS_URL ?? "redis://localhost:6379");
const redisIndex = Number(redisUrl.pathname.slice(1) || "0") + Number(process.env.VITEST_POOL_ID ?? "1");
redisUrl.pathname = "";
const redis = new Redis(redisUrl.toString());
try {
  await redis.select(redisIndex);
} catch (error) {
  redis.disconnect();
  throw new Error(
    `nuxvel testing: Redis does not have database ${redisIndex}. Each test worker uses the index in NUXT_REDIS_URL plus VITEST_POOL_ID. Start Redis with more databases (for example --databases 64), or set a lower --maxWorkers.`,
    { cause: error },
  );
}
redisUrl.pathname = `/${redisIndex}`;
process.env.NUXT_REDIS_URL = redisUrl.toString();
await redis.flushdb();

const sql = postgres(cloneUrl.toString(), { max: 1, onnotice: () => {} });
const tables = await sql<{ name: string }[]>`select format('%I', tablename) as name from pg_tables where schemaname = 'public'`;

afterEach(async () => {
  await redis.flushdb();
  if (tables.length > 0) {
    await sql.unsafe(`truncate table ${tables.map((table) => table.name).join(", ")} restart identity cascade`);
  }
});

afterAll(async () => {
  await sql.end();
  await redis.quit();
  await onAdmin(`drop database if exists "${clone}" with (force)`);
});
