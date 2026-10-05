import { ROLE_ENV, STORYBOOK_PORT_ENV } from "@nuxvel/nuxt/cli";
import { changedMigrations } from "@nuxvel/nuxt/migrations";
import { defineCommand } from "citty";
import postgres from "postgres";
import { maintainAuditPartitions } from "../database/audit-partitions.ts";
import { readMigrationsConfig } from "../database/migrations-config.ts";
import { CHANGED_MIGRATIONS_HINT, hasJournal, pendingMigrations } from "../database/pending-migrations.ts";
import { loadDevConfig, printDevSummary } from "../dev/dev-summary.ts";
import { portlessInvocation } from "../dev/portless-invocation.ts";
import { aliasStorybook, portlessSkipped, storybookPort } from "../dev/storybook.ts";
import { errorMessage } from "../error-message.ts";
import { loadEnvFile } from "../env/load-env-file.ts";
import { asksForHelp } from "../help-args.ts";
import { runNodeTool, runProjectBin } from "../run-project-bin.ts";
import { startDevServices } from "../services/start-dev-services.ts";
import { CliError, fail } from "../ui/fail.ts";
import { isInteractive, plural, report, warn } from "../ui/output.ts";

const OWN_FLAGS = new Set(["--https", "--no-https", "--no-queue"]);

function httpsFlag(rawArgs: string[]) {
  if (rawArgs.includes("--https")) return true;
  if (rawArgs.includes("--no-https")) return false;
  return undefined;
}

async function refuseUnmigratedDatabase(cwd: string, sql: postgres.Sql) {
  const config = await readMigrationsConfig(cwd);

  if (!hasJournal(config.migrationsFolder)) return;

  const changes = await changedMigrations(sql, config);

  if (changes.length > 0) fail(changes.join("\n"), { hint: CHANGED_MIGRATIONS_HINT });

  const pending = await pendingMigrations(sql, config);

  if (pending.length > 0) {
    fail(`${plural(pending.length, "pending migration")}: ${pending.join(", ")}`, {
      hint: "Run nuxvel db:migrate, then nuxvel dev again",
    });
  }
}

async function prepareDevDatabase(cwd: string) {
  const url = process.env.NUXT_DATABASE_OWNER_URL || process.env.NUXT_DATABASE_URL;

  if (!url) return;

  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 5 });

  try {
    await refuseUnmigratedDatabase(cwd, sql);
    await maintainAuditPartitions(cwd, sql);
  } catch (error) {
    if (error instanceof CliError) throw error;
    warn(`Could not create the audit log partitions: ${errorMessage(error)}`, "Run nuxvel db:migrate when the database is up");
  } finally {
    await sql.end();
  }
}

export default defineCommand({
  meta: {
    name: "dev",
    description:
      "Start the dev services, stop when a migration is pending or a migration that ran was edited, create the missing audit log partitions, then `nuxt dev` (extra arguments included) at https://<app>.localhost through portless, with the queue worker running inside it; plain `nuxt dev` with --no-https, outside a terminal or under CI.",
  },
  args: {
    https: {
      type: "boolean",
      description:
        "Serve the app at https://<app>.localhost through portless (the default in a terminal; --https forces it, --no-https runs plain nuxt dev).",
    },
    queue: {
      type: "boolean",
      default: true,
      description: "Run the queue worker inside the dev server (--no-queue leaves it out).",
    },
  },
  async run({ rawArgs }) {
    const cwd = process.cwd();
    const nuxtArgs = rawArgs.filter((arg) => !OWN_FLAGS.has(arg));

    if (asksForHelp(rawArgs)) {
      process.exitCode = await runProjectBin(cwd, "nuxt", ["dev", ...nuxtArgs], { installHint: "npm i nuxt" });
      return;
    }

    const requested = httpsFlag(rawArgs);
    const https = requested ?? isInteractive();

    if (!https && requested === undefined) {
      warn("Not in an interactive terminal (or CI is set): running plain nuxt dev", "Pass --https to serve through portless anyway");
    }

    const services = await startDevServices(cwd);
    const queue = !rawArgs.includes("--no-queue");
    const portless = https ? portlessInvocation(cwd, nuxtArgs) : undefined;

    loadEnvFile(cwd);
    await prepareDevDatabase(cwd);
    const config = await loadDevConfig(cwd);
    const port = await storybookPort(cwd, config.nuxvel?.storybook);
    const storybook = port ? { port, aliased: Boolean(portless) && !portlessSkipped() } : undefined;
    const appUrl = await printDevSummary({ cwd, config, nuxtArgs, portlessName: portless?.name, queue, services, storybook });

    const env: Record<string, string> = {
      ...(process.env.NUXT_SITE_URL ? {} : { NUXT_SITE_URL: appUrl }),
      NUXT_LOCK: "1",
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" "),
      ...(queue ? { [ROLE_ENV]: "worker" } : {}),
      ...(storybook ? { [STORYBOOK_PORT_ENV]: String(storybook.port) } : {}),
    };

    if (!portless) {
      process.exitCode = await runProjectBin(cwd, "nuxt", ["dev", ...nuxtArgs], { installHint: "npm i nuxt", env });
      return;
    }

    if (storybook?.aliased) aliasStorybook(cwd, portless.name, storybook.port);
    report(`Starting nuxt dev through portless as ${portless.name} (--no-https for plain nuxt dev)`);
    process.exitCode = await runNodeTool(cwd, "portless", portless.args, { installHint: "npm i -D @nuxvel/cli", env });
  },
});
