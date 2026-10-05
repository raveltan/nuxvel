import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MigrationConfig } from "drizzle-orm/migrator";
import type { Sql } from "postgres";
import { fail } from "../ui/fail.ts";
import { isRecord } from "../is-record.ts";

export const CHANGED_MIGRATIONS_HINT =
  "Restore the file and put the change in a new migration, or rebuild a dev database with nuxvel db:fresh";

interface JournalEntry {
  tag: string;
  when: number;
}

function isJournalEntry(value: unknown): value is JournalEntry {
  return isRecord(value) && typeof value.tag === "string" && typeof value.when === "number";
}

export function journalFile(migrationsFolder: string) {
  return join(migrationsFolder, "meta", "_journal.json");
}

export function hasJournal(migrationsFolder: string) {
  return existsSync(journalFile(migrationsFolder));
}

export function readJournal(migrationsFolder: string) {
  const path = journalFile(migrationsFolder);

  if (!existsSync(path)) {
    fail(`No migrations journal at ${path}`, { hint: "Generate a migration with nuxvel db:generate" });
  }

  const journal: unknown = JSON.parse(readFileSync(path, "utf8"));

  return isRecord(journal) && Array.isArray(journal.entries) ? journal.entries.filter(isJournalEntry) : [];
}

export async function lastAppliedAt(sql: Sql, config: Required<MigrationConfig>) {
  const [table] = await sql<{ exists: boolean }[]>`
    select exists (
      select 1 from information_schema.tables
      where table_schema = ${config.migrationsSchema} and table_name = ${config.migrationsTable}
    ) as exists
  `;

  if (!table?.exists) return undefined;

  const [last] = await sql<{ created_at: string }[]>`
    select created_at from ${sql(config.migrationsSchema)}.${sql(config.migrationsTable)}
    order by created_at desc limit 1
  `;

  return last === undefined ? undefined : Number(last.created_at);
}

export async function pendingMigrations(sql: Sql, config: Required<MigrationConfig>) {
  const entries = readJournal(config.migrationsFolder);
  const appliedAt = await lastAppliedAt(sql, config);

  return entries.filter((entry) => appliedAt === undefined || appliedAt < entry.when).map((entry) => entry.tag);
}
