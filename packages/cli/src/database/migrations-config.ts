import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { MigrationConfig } from "drizzle-orm/migrator";
import { isRecord } from "../is-record.ts";

function stringAt(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" ? value : undefined;
}

export async function readDrizzleConfig(cwd: string): Promise<Record<string, unknown> | undefined> {
  const file = join(cwd, "drizzle.config.ts");

  if (!existsSync(file)) return undefined;

  const loaded: unknown = await import(pathToFileURL(file).href);

  return isRecord(loaded) && isRecord(loaded.default) ? loaded.default : {};
}

export async function readMigrationsConfig(cwd: string): Promise<Required<MigrationConfig>> {
  const config = await readDrizzleConfig(cwd);

  if (!config) {
    return {
      migrationsFolder: join(cwd, "server", "database", "migrations"),
      migrationsTable: "__drizzle_migrations",
      migrationsSchema: "drizzle",
    };
  }

  const migrations = isRecord(config.migrations) ? config.migrations : {};

  return {
    migrationsFolder: resolve(cwd, stringAt(config, "out") ?? "drizzle"),
    migrationsTable: stringAt(migrations, "table") ?? "__drizzle_migrations",
    migrationsSchema: stringAt(migrations, "schema") ?? "drizzle",
  };
}
