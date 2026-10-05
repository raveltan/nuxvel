import { globSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { describe, it } from "vitest";
import { TEST_ADMIN_DATABASE_URL } from "@nuxvel/test-helpers/services";
import { TEMPLATE_DATABASE_NAME } from "./constants";

const schemaDir = fileURLToPath(new URL("../../../../playground/server/database/schema", import.meta.url));

async function playgroundTableNames() {
  const modules = await Promise.all(
    globSync("*.ts", { cwd: schemaDir }).map((file) => import(pathToFileURL(join(schemaDir, file)).href)),
  );

  return modules
    .flatMap((module) => Object.values(module))
    .filter((value) => is(value, PgTable))
    .map((table) => getTableConfig(table).name);
}

describe("test database global setup", () => {
  it("builds the template from exactly the playground's migrations", async () => {
    const url = new URL(TEST_ADMIN_DATABASE_URL);
    url.pathname = `/${TEMPLATE_DATABASE_NAME}`;
    const sql = postgres(url.toString(), { max: 1 });

    try {
      const rows = await sql<{ name: string }[]>`
        select c.relname as name from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
      `;

      expect(rows.map((row) => row.name).sort()).toEqual(
        [...(await playgroundTableNames()), "_nuxvel_touched_tables"].sort(),
      );
    } finally {
      await sql.end();
    }
  });
});
