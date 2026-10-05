import { defineCommand, runCommand } from "citty";
import postgres from "postgres";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { describeDatabaseUrl } from "../database/describe-database-url.ts";
import { readMigrationsConfig } from "../database/migrations-config.ts";
import { errorMessage } from "../error-message.ts";
import { loadEnvFile } from "../env/load-env-file.ts";
import { requireDatabaseUrl } from "../env/require-database-url.ts";
import { askConfirm } from "../ui/ask-missing-args.ts";
import { fail } from "../ui/fail.ts";
import { intro, outro, plural, step } from "../ui/output.ts";
import migrate from "./db-migrate.ts";

function quoted(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

async function dropEverything(sql: postgres.Sql, migrationsTables: string[]) {
  const tables = await sql<{ name: string }[]>`select tablename as name from pg_tables where schemaname = 'public'`;
  const types = await sql<{ name: string }[]>`
    select t.typname as name from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
  `;

  if (tables.length > 0) {
    await sql.unsafe(`drop table if exists ${tables.map(({ name }) => `public.${quoted(name)}`).join(", ")} cascade`);
  }
  if (types.length > 0) {
    await sql.unsafe(`drop type if exists ${types.map(({ name }) => `public.${quoted(name)}`).join(", ")} cascade`);
  }
  await sql.unsafe(`drop table if exists ${migrationsTables.join(", ")}`);

  return tables.length;
}

export default defineCommand({
  meta: {
    name: "db:fresh",
    description: "Drop every table and run every migration. Refuses when NODE_ENV is production.",
  },
  args: {
    seed: {
      type: "boolean",
      description: "Run every seeder after the migrations.",
      default: false,
    },
    force: {
      type: "boolean",
      description: "Drop the tables without asking.",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();

    loadEnvFile(cwd);

    if (process.env.NODE_ENV === "production") {
      fail("Refusing to run db:fresh: NODE_ENV is production", {
        hint: "Run nuxvel db:migrate and nuxvel db:seed instead",
      });
    }

    const database = requireDatabaseUrl(["NUXT_DATABASE_OWNER_URL", "NUXT_DATABASE_URL"]);
    const target = describeDatabaseUrl(database.url, database.name);

    if (!args.force) {
      await askConfirm(
        `Drop every table in ${target}, then migrate${args.seed ? " and seed" : ""} it?`,
        `db:fresh drops every table in ${target} and needs a confirmation`,
        "Cancelled: the database is unchanged",
      );
    }

    const config = await readMigrationsConfig(cwd);
    const sql = postgres(database.url, { onnotice: () => {} });

    intro("nuxvel db:fresh");

    try {
      const dropped = await dropEverything(sql, [
        `${quoted(config.migrationsSchema)}.${quoted(config.migrationsTable)}`,
        `${quoted(config.migrationsSchema)}.${quoted("__nuxvel_contract_migrations")}`,
      ]).catch((error: unknown) =>
        fail(`Could not drop the tables as ${database.name}: ${errorMessage(error)}`, {
          hint: `Start the database (nuxvel dev starts the app's services), or fix ${database.name}`,
        }),
      );

      step(`Dropped ${plural(dropped, "table")} in ${target}`);
      outro("Database is empty");
    } finally {
      await sql.end();
    }

    await runCommand(migrate, { rawArgs: [] });

    if (args.seed) {
      process.exitCode = await runCommandInApp(cwd, { kind: "db:seed", names: [] });
    }
  },
});
