import { globSync } from "node:fs";
import { join } from "node:path";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { vi } from "vitest";
import type { SchemaTable } from "../runtime/server/database/schema-table";

const loaded = new Map<string, Promise<unknown[]>>();
const schemaGlobs = [
  "server/database/schema/**/*.ts",
  "server/domains/*/schema/**/*.schema.ts",
  "layers/*/server/database/schema/**/*.ts",
  "layers/*/server/domains/*/schema/**/*.schema.ts",
];

async function loadSchema(rootDir: string) {
  const files = globSync(schemaGlobs, { cwd: rootDir }).filter((file) => !/\.(test|spec)\.ts$/.test(file));
  const modules = await Promise.all(
    files.map((file) => vi.importActual<Record<string, unknown>>(join(rootDir, file))),
  );

  return modules.flatMap((module) => Object.values(module));
}

function isTableNamed<Name extends string>(value: unknown, name: Name): value is SchemaTable<Name> {
  return is(value, PgTable) && getTableName(value) === name;
}

export async function appSchemaTable<Name extends string>(name: Name): Promise<SchemaTable<Name>> {
  const { rootDir } = useTestContext().options;

  if (!rootDir) throw new Error('nuxvel testing: the app is not running. List "@nuxvel/nuxt/testing/global-setup" in vitest\'s globalSetup and "@nuxvel/nuxt/testing/setup" in setupFiles');

  if (!loaded.has(rootDir)) loaded.set(rootDir, loadSchema(rootDir));

  const table = (await loaded.get(rootDir))?.find((value): value is SchemaTable<Name> => isTableNamed(value, name));

  if (!table) throw new Error(`nuxvel testing: no table named "${name}" in ${schemaGlobs.join(", ")}`);

  return table;
}
