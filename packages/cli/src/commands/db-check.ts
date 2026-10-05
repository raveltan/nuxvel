import { loadNuxtConfig } from "@nuxt/kit";
import { defineCommand } from "citty";
import { z } from "zod";
import { migrationOrderProblems } from "../database/migration-order.ts";
import { readMigrationsConfig } from "../database/migrations-config.ts";
import { schemaTables } from "../database/schema-tables.ts";
import { unindexedForeignKeys } from "../database/unindexed-foreign-keys.ts";
import { unsafeMigrations, writeBaseline } from "../database/unsafe-migrations.ts";
import { fail } from "../ui/fail.ts";
import { error, plural, report, success } from "../ui/output.ts";

const exceptionsSchema = z.object({
  nuxvel: z.object({ database: z.object({ unindexedForeignKeys: z.record(z.string(), z.string()) }) }),
});

async function listedExceptions(cwd: string) {
  return exceptionsSchema.safeParse(await loadNuxtConfig({ cwd })).data?.nuxvel.database.unindexedForeignKeys ?? {};
}

export default defineCommand({
  meta: {
    name: "db:check",
    description:
      "Check the app's schema and migrations: every foreign key needs an index that starts with its columns, unless nuxvel.database.unindexedForeignKeys lists it with a reason, every migration must come after the one before it in the journal, and every migration after the baseline must be safe to deploy while the live release runs.",
  },
  args: {
    baseline: {
      type: "boolean",
      description: "Accept the current migrations: later runs check only the migrations after the last one.",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { migrationsFolder } = await readMigrationsConfig(cwd);

    if (args.baseline) {
      const tag = writeBaseline(migrationsFolder);

      if (!tag) fail("No migrations to accept", { hint: "Generate a migration with nuxvel db:generate" });
      success(`Baseline set at ${tag}: db:check checks only the migrations after it`);
      return;
    }

    const exceptions = await listedExceptions(cwd);
    const keys = unindexedForeignKeys(await schemaTables(cwd)).filter((key) => !exceptions[key]?.trim());
    const order = migrationOrderProblems(migrationsFolder);
    const migrations = unsafeMigrations(migrationsFolder);

    for (const key of keys) error(`Foreign key ${key} has no index that starts with its columns`);
    for (const finding of [...order, ...migrations]) {
      report(`${finding.tag}:`);
      error(finding.problem, finding.hint);
    }

    if (keys.length > 0 || order.length > 0 || migrations.length > 0) {
      const problems = [
        ...(keys.length > 0 ? [`${plural(keys.length, "foreign key")} without an index`] : []),
        ...(order.length > 0 ? [`${plural(new Set(order.map((finding) => finding.tag)).size, "migration")} out of order`] : []),
        ...(migrations.length > 0 ? [plural(migrations.length, "unsafe migration statement")] : []),
      ];

      fail(problems.join(", "), {
        hint:
          keys.length > 0
            ? "Add an index on the columns in the table's schema file, or list the key in nuxvel.database.unindexedForeignKeys with a reason"
            : order.length > 0
              ? "Generate each one again after the migrations from the other branch"
              : "Fix each one, or run nuxvel db:check --baseline to accept the migrations that already ran in production",
      });
    }

    success("Every foreign key has an index");
    success("Every migration is in order");
    success("Every migration is safe to deploy");
  },
});
