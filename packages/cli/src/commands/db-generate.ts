import { defineCommand } from "citty";
import { moveBlockingIndexes } from "../database/concurrent-indexes.ts";
import { moveBreakingStatements } from "../database/contract-statements.ts";
import { readMigrationsConfig } from "../database/migrations-config.ts";
import { hasJournal, readJournal } from "../database/pending-migrations.ts";
import { runProjectBin } from "../run-project-bin.ts";
import { plural, report, warn } from "../ui/output.ts";

function drizzleKitArgs(rawArgs: string[]) {
  const [first, ...rest] = rawArgs;

  return first !== undefined && !first.startsWith("-") ? ["--name", first, ...rest] : rawArgs;
}

function journalTags(migrationsFolder: string) {
  return hasJournal(migrationsFolder)
    ? readJournal(migrationsFolder).map((entry) => entry.tag)
    : [];
}

export default defineCommand({
  meta: {
    name: "db:generate",
    description:
      "Generate a Drizzle migration from the app's schema, named by the first argument (passthrough to `drizzle-kit generate`, extra arguments included), then move its breaking statements into migrations/contract/ and each index on an existing table into a -- nuxvel:no-transaction migration of its own that builds it with CREATE INDEX CONCURRENTLY.",
  },
  async run({ rawArgs }) {
    const cwd = process.cwd();
    const { migrationsFolder } = await readMigrationsConfig(cwd);
    const before = new Set(journalTags(migrationsFolder));

    process.exitCode = await runProjectBin(cwd, "drizzle-kit", ["generate", ...drizzleKitArgs(rawArgs)], {
      installHint: "npm i -D drizzle-kit",
    });

    if (process.exitCode !== 0) return;

    for (const tag of journalTags(migrationsFolder).filter((tag) => !before.has(tag))) {
      const moved = moveBreakingStatements(migrationsFolder, tag);
      const indexTags = moveBlockingIndexes(migrationsFolder, tag);

      if (indexTags.length > 0) {
        warn(
          `Moved ${indexTags.length === 1 ? "1 index on an existing table" : `${indexTags.length} indexes on existing tables`} to ${indexTags.join(", ")}`,
          "Each one builds with CREATE INDEX CONCURRENTLY, outside a transaction, so the writes to the table go on while it builds",
        );
      }
      if (moved.length === 0) continue;

      warn(
        `Moved ${plural(moved.length, "breaking statement")} to contract/${tag}.sql`,
        "A deploy runs it once no older release runs. A rename or a type change breaks the new release until then: add a column and backfill it instead",
      );
      for (const statement of moved) report(`    ${statement}`);
    }
  },
});
