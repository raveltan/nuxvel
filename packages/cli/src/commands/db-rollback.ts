import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { defineCommand } from "citty";
import postgres from "postgres";
import { describeDatabaseUrl } from "../database/describe-database-url.ts";
import { readMigrationsConfig } from "../database/migrations-config.ts";
import { lastAppliedAt, readJournal } from "../database/pending-migrations.ts";
import { loadEnvFile } from "../env/load-env-file.ts";
import { requireDatabaseUrl } from "../env/require-database-url.ts";
import { fail } from "../ui/fail.ts";
import { intro, outro, step, warn } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "db:rollback",
    description:
      "Undo the last applied migration with its hand-written down migration (migrations/down/<name>.sql), as NUXT_DATABASE_OWNER_URL or NUXT_DATABASE_URL. Refuses when NODE_ENV is production.",
  },
  args: {
    force: {
      type: "boolean",
      description: "Roll back even when NODE_ENV is production.",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();

    loadEnvFile(cwd);

    if (process.env.NODE_ENV === "production" && !args.force) {
      fail("Refusing to roll back: NODE_ENV is production", { hint: "Pass --force to roll this database back anyway" });
    }

    const database = requireDatabaseUrl(["NUXT_DATABASE_OWNER_URL", "NUXT_DATABASE_URL"]);
    const config = await readMigrationsConfig(cwd);
    const sql = postgres(database.url, { max: 1, onnotice: () => {} });

    intro("nuxvel db:rollback");

    try {
      step(`Connected as ${database.name} (${describeDatabaseUrl(database.url, database.name)})`);

      const appliedAt = await lastAppliedAt(sql, config);

      if (appliedAt === undefined) {
        outro("No migration to roll back");
        return;
      }

      const last = readJournal(config.migrationsFolder).find((entry) => entry.when === appliedAt);

      if (!last) {
        fail("The last applied migration is not in the migrations journal", {
          hint: "Restore its entry in meta/_journal.json, or run nuxvel db:fresh",
        });
      }

      const downFile = join(config.migrationsFolder, "down", `${last.tag}.sql`);

      if (!existsSync(downFile)) {
        warn(`No down migration for ${last.tag}`, `Write the SQL that undoes it in ${relative(cwd, downFile)}, then run nuxvel db:rollback again`);
        process.exitCode = 1;
        return;
      }

      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(downFile, "utf8"));
        await tx`delete from ${tx(config.migrationsSchema)}.${tx(config.migrationsTable)} where created_at = ${appliedAt}`;
      });

      step(`Rolled back ${last.tag}`);
      outro("Run nuxvel db:migrate to apply it again");
    } finally {
      await sql.end();
    }
  },
});
