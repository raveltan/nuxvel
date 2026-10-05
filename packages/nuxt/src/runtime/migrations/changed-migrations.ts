import type { ReservedSql, Sql } from "postgres";
import { readMigrations } from "./read-migrations";

/**
 * Options of {@link changedMigrations}.
 */
export interface ChangedMigrationsOptions {
  /** The folder with `meta/_journal.json` and the migration files. */
  migrationsFolder: string;
  /** Drizzle's migrations table. Defaults to `__drizzle_migrations`. */
  migrationsTable?: string;
  /** The schema of the migrations table. Defaults to `drizzle`. */
  migrationsSchema?: string;
}

/**
 * Lists each migration that ran on the database and no longer agrees with
 * the migration files, as one sentence per migration.
 *
 * A migration changed when the SHA-256 of its file differs from the hash
 * that the migrations table recorded. A migration is missing when no entry of
 * `meta/_journal.json` has the time the table recorded: `db:generate`
 * regenerated it, or it came from another branch. An empty list means that
 * the files agree with the database. {@link runMigrations} refuses to migrate
 * when the list is not empty, and `nuxvel doctor` and `nuxvel dev` report it.
 *
 * @example
 * ```ts
 * import { changedMigrations } from "@nuxvel/nuxt/migrations";
 *
 * const changes = await changedMigrations(sql, { migrationsFolder: "server/database/migrations" });
 * // ["0016_webhook-endpoints changed after it ran on this database"]
 * ```
 */
export async function changedMigrations(sql: Sql | ReservedSql, options: ChangedMigrationsOptions): Promise<string[]> {
  const schema = options.migrationsSchema ?? "drizzle";
  const table = options.migrationsTable ?? "__drizzle_migrations";
  const [exists] = await sql<{ present: boolean }[]>`select to_regclass(${`"${schema}"."${table}"`}) is not null as present`;

  if (!exists?.present) return [];

  const applied = await sql<{ hash: string; created_at: string | null }[]>`
    select hash, created_at from ${sql(schema)}.${sql(table)} order by created_at, id
  `;
  const byWhen = new Map(readMigrations(options.migrationsFolder).map((migration) => [migration.when, migration]));

  return applied.flatMap((row) => {
    const when = Number(row.created_at);
    const migration = byWhen.get(when);

    if (!migration) return [`the migration that ran at ${new Date(when).toISOString()} is not in meta/_journal.json`];

    return migration.hash === row.hash ? [] : [`${migration.tag} changed after it ran on this database`];
  });
}
