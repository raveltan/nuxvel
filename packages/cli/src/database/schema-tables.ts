import { pathToFileURL } from "node:url";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { glob } from "tinyglobby";
import { readDrizzleConfig } from "./migrations-config.ts";

const DEFAULT_SCHEMA = [
  "./server/database/schema/**/*.ts",
  "./server/domains/*/schema/**/*.schema.ts",
  "./layers/*/server/database/schema/**/*.ts",
  "./layers/*/server/domains/*/schema/**/*.schema.ts",
];

function schemaPatterns(schema: unknown) {
  if (typeof schema === "string") return [schema];
  if (Array.isArray(schema)) return schema.filter((pattern) => typeof pattern === "string");

  return DEFAULT_SCHEMA;
}

export async function schemaTables(cwd: string): Promise<PgTable[]> {
  const config = await readDrizzleConfig(cwd);
  const files = await glob(schemaPatterns(config?.schema), { cwd, absolute: true });
  const tables = new Set<PgTable>();

  for (const file of files.sort()) {
    const exported: Record<string, unknown> = await import(pathToFileURL(file).href);

    for (const value of Object.values(exported)) if (is(value, PgTable)) tables.add(value);
  }

  return [...tables];
}
