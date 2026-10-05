import { defineCommand } from "citty";
import { changedMigrations, runMigrations } from "@nuxvel/nuxt/migrations";
import postgres from "postgres";
import { maintainAuditPartitions } from "../database/audit-partitions.ts";
import { describeDatabaseUrl } from "../database/describe-database-url.ts";
import { lockTimeoutError } from "../database/lock-timeout.ts";
import { readMigrationsConfig } from "../database/migrations-config.ts";
import { CHANGED_MIGRATIONS_HINT, pendingMigrations } from "../database/pending-migrations.ts";
import { errorMessage } from "../error-message.ts";
import { loadEnvFile } from "../env/load-env-file.ts";
import { requireDatabaseUrl } from "../env/require-database-url.ts";
import { fail } from "../ui/fail.ts";
import { intro, message, outro, plural, step, warn } from "../ui/output.ts";
import { startSpinner } from "../ui/spinner.ts";

async function maintainPartitions(sql: postgres.Sql) {
  await maintainAuditPartitions(process.cwd(), sql).catch((error: unknown) =>
    fail(`Could not create the audit log partitions: ${errorMessage(error)}`, {
      hint: "Check the error, then run nuxvel db:migrate again",
    }),
  );
}

export default defineCommand({
  meta: {
    name: "db:migrate",
    description:
      "Run the pending migrations, then every contract migration, as NUXT_DATABASE_OWNER_URL, or NUXT_DATABASE_URL when it is unset, from the shell or .env, retrying a lock timeout (5s) 3 times, then create the missing audit log partitions.",
  },
  async run() {
    loadEnvFile(process.cwd());

    const database = requireDatabaseUrl(["NUXT_DATABASE_OWNER_URL", "NUXT_DATABASE_URL"]);
    const config = await readMigrationsConfig(process.cwd());
    const sql = postgres(database.url, { onnotice: () => {} });

    intro("nuxvel db:migrate");

    try {
      await sql`select 1`.catch((error: unknown) =>
        fail(`Could not connect as ${database.name}: ${errorMessage(error)}`, {
          hint: `Start the database (nuxvel dev starts the app's services), or fix ${database.name}`,
        }),
      );

      step(`Connected as ${database.name} (${describeDatabaseUrl(database.url, database.name)})`);

      const changes = await changedMigrations(sql, config);

      if (changes.length > 0) fail(changes.join("\n"), { hint: CHANGED_MIGRATIONS_HINT });

      const pending = await pendingMigrations(sql, config);
      const title = pending.length > 0 ? `Applying ${plural(pending.length, "migration")}` : "Checking the contract migrations";
      let spinner = startSpinner(title);
      const result = await runMigrations(sql, {
        ...config,
        contract: true,
        onLockRetry: (retry) => {
          spinner.fail(`Timed out waiting for a lock, retry ${retry} of 3`);
          spinner = startSpinner(title);
        },
      }).catch((error: unknown) => {
        const lockTimeout = lockTimeoutError(error);

        spinner.fail(`Could not apply the migrations`);
        return fail(errorMessage(lockTimeout ?? error), {
          hint: lockTimeout
            ? "Another session holds a lock that a migration needs. Wait for it to end, then run nuxvel db:migrate again"
            : "Check the migration SQL, then run nuxvel db:migrate again",
        });
      });
      const applied = [...result.applied, ...result.contract.map((tag) => `contract/${tag}`)];

      if (applied.length === 0) {
        spinner.done("No pending migrations");
      } else {
        spinner.done(`Applied ${plural(applied.length, "migration")}`);
        message(applied.map((name) => `  ${name}`));
      }
      if (result.deferred.length > 0) {
        warn(
          `Deferred ${plural(result.deferred.length, "migration")} waiting on a backfill`,
          "Run the backfill to completion, then run nuxvel db:migrate again",
        );
        message(result.deferred.map((name) => `  contract/${name}`));
      }
      await maintainPartitions(sql);
      outro(applied.length === 0 && result.deferred.length === 0 ? "Already up to date" : "Database is up to date");
    } finally {
      await sql.end();
    }
  },
});
