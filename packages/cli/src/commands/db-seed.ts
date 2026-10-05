import { randomInt } from "node:crypto";
import { defineCommand } from "citty";
import { drizzle } from "drizzle-orm/postgres-js";
import { getTableColumns } from "drizzle-orm";
import { type PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { seed } from "drizzle-seed";
import postgres from "postgres";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { schemaTables } from "../database/schema-tables.ts";
import { volumeTables } from "../database/volume-tables.ts";
import { errorMessage } from "../error-message.ts";
import { loadEnvFile } from "../env/load-env-file.ts";
import { requireDatabaseUrl } from "../env/require-database-url.ts";
import { fail } from "../ui/fail.ts";
import { report, success } from "../ui/output.ts";
import { startSpinner } from "../ui/spinner.ts";

const VOLUME_ROWS = 1000;

type Refinements = Record<string, { columns: Record<string, unknown> }>;

function integerPrimaryKeys(table: PgTable) {
  return Object.entries(getTableColumns(table)).filter(
    ([, column]) => column.primary && ["serial", "integer", "bigserial", "bigint", "smallserial", "smallint"].includes(column.getSQLType()),
  );
}

async function largestIds(sql: postgres.Sql, tables: PgTable[]) {
  const largest = new Map<string, number>();

  for (const table of tables) {
    for (const [key, column] of integerPrimaryKeys(table)) {
      const [row] = await sql.unsafe<{ max: number }[]>(`select coalesce(max("${column.name}"), 0)::bigint as max from "${getTableConfig(table).name}"`);
      largest.set(`${getTableConfig(table).name}.${key}`, Number(row?.max ?? 0));
    }
  }

  return largest;
}

async function advanceSequences(sql: postgres.Sql, tables: PgTable[]) {
  for (const table of tables) {
    const name = getTableConfig(table).name;

    for (const [, column] of integerPrimaryKeys(table)) {
      await sql`
        select setval(sequence, (select max(${sql(column.name)}) from ${sql(name)}))
        from pg_get_serial_sequence(${`"${name}"`}, ${column.name}) as sequence
        where sequence is not null
      `;
    }
  }
}

async function seedVolume(cwd: string) {
  const database = requireDatabaseUrl(["NUXT_DATABASE_URL"]);
  const { filled, skipped } = volumeTables(await schemaTables(cwd));

  for (const [table, reason] of skipped) report(`  skip ${table}: ${reason}`);
  if (filled.length === 0) fail("No table to fill", { hint: "Every table of the schema was skipped" });

  const sql = postgres(database.url, { onnotice: () => {} });
  const spinner = startSpinner(`Filling ${filled.length} tables with ${VOLUME_ROWS} rows each`);

  try {
    const largest = await largestIds(sql, filled);

    await seed(drizzle(sql), Object.fromEntries(filled.map((table) => [getTableConfig(table).name, table])), {
      count: VOLUME_ROWS,
      seed: randomInt(2 ** 31),
    }).refine((generators) => {
      const refinements: Refinements = {};

      for (const table of filled) {
        const name = getTableConfig(table).name;

        for (const [key] of integerPrimaryKeys(table)) {
          const after = largest.get(`${name}.${key}`) ?? 0;
          refinements[name] ??= { columns: {} };
          refinements[name].columns[key] = generators.int({ minValue: after + 1, maxValue: after + VOLUME_ROWS, isUnique: true });
        }
      }

      return refinements;
    });
    await advanceSequences(sql, filled);
    spinner.done();
  } catch (error) {
    spinner.fail();
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    fail(errorMessage(cause), {
      hint: /duplicate key/.test(errorMessage(cause))
        ? "Generated values clash with rows already there: run it on an empty database, after nuxvel db:fresh"
        : "Check the error, then run nuxvel db:seed --volume again",
    });
  } finally {
    await sql.end();
  }

  success(`Filled ${filled.map((table) => getTableConfig(table).name).join(", ")} with ${VOLUME_ROWS} rows each`);
}

export default defineCommand({
  meta: {
    name: "db:seed",
    description:
      "Run every seeder under server/seeders, or the named ones, inside the app, or with --volume fill the app's tables with generated rows.",
  },
  args: {
    name: {
      type: "positional",
      description: "Names of the seeders to run, e.g. database blog.posts. Without one, every seeder runs.",
      required: false,
    },
    volume: {
      type: "boolean",
      description: `Fill each table of the schema with ${VOLUME_ROWS} generated rows with drizzle-seed, instead of running the seeders. Skips the tables of nuxvel, those with a tsvector column and those that reference a skipped one.`,
      default: false,
    },
    force: {
      type: "boolean",
      description: "Seed even when NODE_ENV is production.",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();

    loadEnvFile(cwd);

    if (process.env.NODE_ENV === "production" && !args.force) {
      fail("Refusing to seed: NODE_ENV is production", { hint: "Pass --force to seed this database anyway" });
    }

    if (args.volume) {
      await seedVolume(cwd);
      return;
    }

    process.exitCode = await runCommandInApp(cwd, { kind: "db:seed", names: args._ });
  },
});
