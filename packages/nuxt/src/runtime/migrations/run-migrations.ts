import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReservedSql, Sql } from "postgres";
import { changedMigrations } from "./changed-migrations";
import { readMigrations } from "./read-migrations";

/**
 * Options of {@link runMigrations}.
 */
export interface MigrationsOptions {
  /** The folder with `meta/_journal.json`, the expand migrations and `contract/`. */
  migrationsFolder: string;
  /** Drizzle's migrations table. Defaults to `__drizzle_migrations`. */
  migrationsTable?: string;
  /** The schema of both migrations tables. Defaults to `drizzle`. */
  migrationsSchema?: string;
  /**
   * Which contract migrations to apply after the expand migrations: `true`
   * for every one, a list of names for only those, `false` for none.
   */
  contract: boolean | string[];
  /** Called before each retry of a migration that timed out waiting for a lock. */
  onLockRetry?: (retry: number, error: Error) => void;
}

/**
 * What {@link runMigrations} did.
 */
export interface MigrationsResult {
  /** The expand migrations it applied, in order. */
  applied: string[];
  /** The contract migrations it applied, in order. */
  contract: string[];
  /** The contract migrations it left for later: not allowed by `contract`, or waiting on a backfill. */
  deferred: string[];
}

const CHANGED_HINT = "Restore the file and put the change in a new migration, or rebuild a dev database with nuxvel db:fresh";
const LOCK_NOT_AVAILABLE = "55P03";
const LOCK_RETRIES = 3;
const BREAKPOINT = "--> statement-breakpoint";
const NO_TRANSACTION = /^--\s*nuxvel:no-transaction\s*$/m;
const REQUIRES_BACKFILL = /^--\s*nuxvel:requires-backfill=(\S+)\s*$/m;
const CONCURRENT_INDEX = /create\s+(?:unique\s+)?index\s+concurrently\s+(?:if\s+not\s+exists\s+)?("(?:[^"]|"")+"|[\w$]+)/i;

function identifier(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

function statements(source: string) {
  return source.split(BREAKPOINT).filter((statement) => statement.trim() !== "");
}

function isLockTimeout(error: unknown): error is Error {
  return error instanceof Error && "code" in error && error.code === LOCK_NOT_AVAILABLE;
}

async function withLockRetries(options: MigrationsOptions, apply: () => Promise<void>, beforeRetry = async () => {}) {
  for (let retry = 0; ; retry++) {
    try {
      await apply();
      return;
    } catch (error) {
      if (!isLockTimeout(error) || retry >= LOCK_RETRIES) throw error;
      options.onLockRetry?.(retry + 1, error);
      await beforeRetry();
    }
  }
}

async function dropInvalidIndex(sql: ReservedSql, statement: string) {
  const name = CONCURRENT_INDEX.exec(statement)?.[1];

  if (!name) return;

  const unquoted = name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name.toLowerCase();
  const [invalid] = await sql<{ schema: string }[]>`
    select n.nspname as schema from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = ${unquoted} and not i.indisvalid and n.nspname = any(current_schemas(false))
  `;

  if (invalid) await sql.unsafe(`drop index concurrently if exists ${identifier(invalid.schema)}.${identifier(unquoted)}`);
}

async function applyWithoutTransaction(sql: ReservedSql, options: MigrationsOptions, source: string, record: () => Promise<void>) {
  const [statement, ...rest] = statements(source);

  if (!statement || rest.length > 0) {
    throw new Error("A -- nuxvel:no-transaction migration holds exactly one statement");
  }

  await dropInvalidIndex(sql, statement);
  await withLockRetries(
    options,
    async () => {
      await sql.unsafe(statement);
    },
    () => dropInvalidIndex(sql, statement),
  );
  await record();
}

async function applyInTransaction(sql: ReservedSql, options: MigrationsOptions, source: string, record: (tx: ReservedSql) => Promise<void>) {
  await withLockRetries(options, async () => {
    await sql`begin`;
    try {
      for (const statement of statements(source)) await sql.unsafe(statement);
      await record(sql);
      await sql`commit`;
    } catch (error) {
      await sql`rollback`;
      throw error;
    }
  });
}

async function apply(sql: ReservedSql, options: MigrationsOptions, source: string, record: (tx: ReservedSql) => Promise<void>) {
  if (NO_TRANSACTION.test(source)) await applyWithoutTransaction(sql, options, source, () => record(sql));
  else await applyInTransaction(sql, options, source, record);
}

async function backfillCompleted(sql: ReservedSql, name: string) {
  const [table] = await sql<{ exists: boolean }[]>`select to_regclass('backfills') is not null as exists`;

  if (!table?.exists) return false;

  const [row] = await sql<{ completed: boolean }[]>`select completed_at is not null as completed from backfills where name = ${name}`;

  return row?.completed ?? false;
}

async function applyContract(sql: ReservedSql, options: MigrationsOptions, contractTable: string, tag: string, result: MigrationsResult, fresh: boolean) {
  const file = join(options.migrationsFolder, "contract", `${tag}.sql`);

  if (!existsSync(file)) return;

  const source = readFileSync(file, "utf8");
  const backfill = REQUIRES_BACKFILL.exec(source)?.[1];
  const allowed = options.contract === true || (Array.isArray(options.contract) && options.contract.includes(tag));

  if (!allowed || (backfill && !fresh && !(await backfillCompleted(sql, backfill)))) {
    result.deferred.push(tag);
    return;
  }

  await apply(sql, options, source, async (tx) => {
    await tx.unsafe(`insert into ${contractTable} (name) values ($1)`, [tag]);
  });
  result.contract.push(tag);
}

/**
 * Applies the pending migrations of an app, then the contract migrations
 * that `options.contract` allows. It is what `nuxvel db:migrate`, the
 * release's `migrate.mjs` and the test database setups run.
 *
 * Each expand migration in `meta/_journal.json` runs in its own transaction
 * and is recorded in Drizzle's migrations table, so a database Drizzle's
 * migrator set up carries on. A file with a `-- nuxvel:no-transaction` line
 * holds one statement, such as `CREATE INDEX CONCURRENTLY`, and runs outside
 * a transaction; an invalid index it left behind is dropped before a retry.
 * A contract migration is `contract/<tag>.sql`, runs after the expand
 * migrations and is recorded in `__nuxvel_contract_migrations`; one with a
 * `-- nuxvel:requires-backfill=<name>` line waits until that backfill
 * completed. On a database with no applied migration, each contract
 * migration runs right after its own expand migration instead, so a later
 * migration can re-create what it dropped. Every table is still empty there,
 * so a contract migration that waits on a backfill runs at once too.
 *
 * It throws before it applies a migration when {@link changedMigrations}
 * lists a migration that ran and no longer agrees with its file.
 *
 * It keeps a `lock_timeout` or `statement_timeout` the connection sets, and
 * otherwise uses 5 seconds and 15 minutes. A migration that times out waiting
 * for a lock is retried 3 times; then the error is thrown. Throws the error of
 * a failing migration, with the migrations before it applied.
 *
 * @example
 * ```ts
 * import { runMigrations } from "@nuxvel/nuxt/migrations";
 *
 * const sql = postgres(process.env.NUXT_DATABASE_OWNER_URL!, { max: 1 });
 * await runMigrations(sql, { migrationsFolder: "server/database/migrations", contract: true });
 * ```
 */
export async function runMigrations(pool: Sql, options: MigrationsOptions): Promise<MigrationsResult> {
  const schema = identifier(options.migrationsSchema ?? "drizzle");
  const table = `${schema}.${identifier(options.migrationsTable ?? "__drizzle_migrations")}`;
  const contractTable = `${schema}.${identifier("__nuxvel_contract_migrations")}`;
  const migrations = readMigrations(options.migrationsFolder);
  const sql = await pool.reserve();
  const result: MigrationsResult = { applied: [], contract: [], deferred: [] };

  try {
    await sql`select pg_advisory_lock(hashtext('nuxvel migrations'))`;
    await sql`select set_config('lock_timeout', case current_setting('lock_timeout') when '0' then '5s' else current_setting('lock_timeout') end, false)`;
    await sql`select set_config('statement_timeout', case current_setting('statement_timeout') when '0' then '15min' else current_setting('statement_timeout') end, false)`;
    await sql.unsafe(`create schema if not exists ${schema}`);
    await sql.unsafe(`create table if not exists ${table} (id serial primary key, hash text not null, created_at bigint)`);
    await sql.unsafe(`create table if not exists ${contractTable} (name text primary key, applied_at timestamptz not null default now())`);

    const changes = await changedMigrations(sql, options);

    if (changes.length > 0) {
      const sentences = changes.map((change) => `${change.charAt(0).toUpperCase()}${change.slice(1)}.`);

      throw new Error(`Cannot migrate. ${sentences.join(" ")} ${CHANGED_HINT}.`);
    }

    const [last] = await sql.unsafe<{ created_at: string }[]>(`select created_at from ${table} order by created_at desc limit 1`);
    const lastAppliedAt = last === undefined ? undefined : Number(last.created_at);
    const fresh = lastAppliedAt === undefined;
    const appliedContract = new Set(
      (await sql.unsafe<{ name: string }[]>(`select name from ${contractTable}`)).map((row) => row.name),
    );

    for (const migration of migrations) {
      if (lastAppliedAt !== undefined && migration.when <= lastAppliedAt) continue;

      await apply(sql, options, migration.source, async (tx) => {
        await tx.unsafe(`insert into ${table} (hash, created_at) values ($1, $2)`, [migration.hash, migration.when]);
      });
      result.applied.push(migration.tag);
      if (fresh && !appliedContract.has(migration.tag)) await applyContract(sql, options, contractTable, migration.tag, result, true);
    }

    if (!fresh) {
      for (const { tag } of migrations) {
        if (!appliedContract.has(tag)) await applyContract(sql, options, contractTable, tag, result, false);
      }
    }
  } finally {
    await sql`select pg_advisory_unlock(hashtext('nuxvel migrations'))`.catch(() => {});
    sql.release();
  }

  return result;
}
