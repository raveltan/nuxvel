import { type CommandDef, type Resolvable, type SubCommandsDef, defineCommand, renderUsage, runCommand } from "citty";
import { colors } from "consola/utils";
import pkg from "../package.json" with { type: "json" };
import { asksForHelp, commandName, isHelpArg } from "./help-args.ts";
import { askMissingArgs } from "./ui/ask-missing-args.ts";
import { reportFailure } from "./ui/fail.ts";
import { error, print, report } from "./ui/output.ts";

const commandGroups: Record<string, SubCommandsDef> = {
  Development: {
    dev: () => import("./commands/dev.ts").then((command) => command.default),
    test: () => import("./commands/test.ts").then((command) => command.default),
    "test:e2e": () => import("./commands/test-e2e.ts").then((command) => command.default),
    "test:ui": () => import("./commands/test-ui.ts").then((command) => command.default),
    services: () => import("./commands/services.ts").then((command) => command.default),
    "test:arch": () => import("./commands/test-arch.ts").then((command) => command.default),
    "test:compat": () => import("./commands/test-compat.ts").then((command) => command.default),
    doctor: () => import("./commands/doctor.ts").then((command) => command.default),
    tinker: () => import("./commands/tinker.ts").then((command) => command.default),
    routes: () => import("./commands/routes.ts").then((command) => command.default),
    channels: () => import("./commands/channels.ts").then((command) => command.default),
    "openapi:export": () => import("./commands/openapi-export.ts").then((command) => command.default),
  },
  Database: {
    "db:generate": () => import("./commands/db-generate.ts").then((command) => command.default),
    "db:migrate": () => import("./commands/db-migrate.ts").then((command) => command.default),
    "db:seed": () => import("./commands/db-seed.ts").then((command) => command.default),
    "db:fresh": () => import("./commands/db-fresh.ts").then((command) => command.default),
    "db:check": () => import("./commands/db-check.ts").then((command) => command.default),
    "db:rollback": () => import("./commands/db-rollback.ts").then((command) => command.default),
    "db:studio": () => import("./commands/db-studio.ts").then((command) => command.default),
  },
  Generators: {
    "make:page": () => import("./commands/make-page.ts").then((command) => command.default),
    "make:story": () => import("./commands/make-story.ts").then((command) => command.default),
    "make:module": () => import("./commands/make-module.ts").then((command) => command.default),
    "make:schema": () => import("./commands/make-schema.ts").then((command) => command.default),
    "make:policy": () => import("./commands/make-policy.ts").then((command) => command.default),
    "make:action": () => import("./commands/make-action.ts").then((command) => command.default),
    "make:router": () => import("./commands/make-router.ts").then((command) => command.default),
    "make:resource": () => import("./commands/make-resource.ts").then((command) => command.default),
    "make:test": () => import("./commands/make-test.ts").then((command) => command.default),
    "make:job": () => import("./commands/make-job.ts").then((command) => command.default),
    "make:mail": () => import("./commands/make-mail.ts").then((command) => command.default),
    "make:notification": () => import("./commands/make-notification.ts").then((command) => command.default),
    "make:webhook": () => import("./commands/make-webhook.ts").then((command) => command.default),
    "make:channel": () => import("./commands/make-channel.ts").then((command) => command.default),
    "make:factory": () => import("./commands/make-factory.ts").then((command) => command.default),
    "make:seeder": () => import("./commands/make-seeder.ts").then((command) => command.default),
    "factory:sync": () => import("./commands/factory-sync.ts").then((command) => command.default),
    "make:loadtest": () => import("./commands/make-loadtest.ts").then((command) => command.default),
    upgrade: () => import("./commands/upgrade.ts").then((command) => command.default),
  },
  "Queues and schedules": {
    "queue:work": () => import("./commands/queue-work.ts").then((command) => command.default),
    "queue:failed": () => import("./commands/queue-failed.ts").then((command) => command.default),
    "queue:retry": () => import("./commands/queue-retry.ts").then((command) => command.default),
    "queue:clear": () => import("./commands/queue-clear.ts").then((command) => command.default),
    "queue:versions": () => import("./commands/queue-versions.ts").then((command) => command.default),
    "make:schedule": () => import("./commands/make-schedule.ts").then((command) => command.default),
    "schedule:list": () => import("./commands/schedule-list.ts").then((command) => command.default),
    "schedule:prune": () => import("./commands/schedule-prune.ts").then((command) => command.default),
    "schedule:run": () => import("./commands/schedule-run.ts").then((command) => command.default),
  },
  Tasks: {
    "make:task": () => import("./commands/make-task.ts").then((command) => command.default),
    "task:run": () => import("./commands/task-run.ts").then((command) => command.default),
  },
  Billing: {
    "billing:status": () => import("./commands/billing-status.ts").then((command) => command.default),
    "billing:replay": () => import("./commands/billing-replay.ts").then((command) => command.default),
  },
  Backfills: {
    "make:backfill": () => import("./commands/make-backfill.ts").then((command) => command.default),
    "backfill:status": () => import("./commands/backfill-status.ts").then((command) => command.default),
  },
  "Flags and experiments": {
    "make:flag": () => import("./commands/make-flag.ts").then((command) => command.default),
    "make:experiment": () => import("./commands/make-experiment.ts").then((command) => command.default),
    "flags:list": () => import("./commands/flags-list.ts").then((command) => command.default),
    "flags:set": () => import("./commands/flags-set.ts").then((command) => command.default),
    "flags:stale": () => import("./commands/flags-stale.ts").then((command) => command.default),
    "experiment:start": () => import("./commands/experiment-start.ts").then((command) => command.default),
    "experiment:stop": () => import("./commands/experiment-stop.ts").then((command) => command.default),
    "experiment:report": () => import("./commands/experiment-report.ts").then((command) => command.default),
  },
  Audit: {
    "audit:verify": () => import("./commands/audit-verify.ts").then((command) => command.default),
    "audit:tail": () => import("./commands/audit-tail.ts").then((command) => command.default),
    "audit:export": () => import("./commands/audit-export.ts").then((command) => command.default),
  },
  Privacy: {
    "user:export": () => import("./commands/user-export.ts").then((command) => command.default),
    "user:erase": () => import("./commands/user-erase.ts").then((command) => command.default),
  },
  Storage: {
    "storage:setup": () => import("./commands/storage-setup.ts").then((command) => command.default),
    "storage:check": () => import("./commands/storage-check.ts").then((command) => command.default),
  },
  Events: {
    "make:event": () => import("./commands/make-event.ts").then((command) => command.default),
    "make:listener": () => import("./commands/make-listener.ts").then((command) => command.default),
    events: () => import("./commands/events.ts").then((command) => command.default),
  },
  Deploy: {
    "server:setup": () => import("./commands/server-setup.ts").then((command) => command.default),
    "app:create": () => import("./commands/app-create.ts").then((command) => command.default),
    deploy: () => import("./commands/deploy.ts").then((command) => command.default),
    "make:ci": () => import("./commands/make-ci.ts").then((command) => command.default),
    releases: () => import("./commands/releases.ts").then((command) => command.default),
    "deploy:unlock": () => import("./commands/deploy-unlock.ts").then((command) => command.default),
    "db:contract": () => import("./commands/db-contract.ts").then((command) => command.default),
    rollback: () => import("./commands/rollback.ts").then((command) => command.default),
    "app:rotate-credentials": () => import("./commands/app-rotate-credentials.ts").then((command) => command.default),
    "app:destroy": () => import("./commands/app-destroy.ts").then((command) => command.default),
  },
  Operations: {
    "env:pull": () => import("./commands/env-pull.ts").then((command) => command.default),
    "env:push": () => import("./commands/env-push.ts").then((command) => command.default),
    logs: () => import("./commands/logs.ts").then((command) => command.default),
    status: () => import("./commands/status.ts").then((command) => command.default),
    ssh: () => import("./commands/ssh.ts").then((command) => command.default),
    "server:status": () => import("./commands/server-status.ts").then((command) => command.default),
    "server:upgrade": () => import("./commands/server-upgrade.ts").then((command) => command.default),
  },
  Backups: {
    "db:backup": () => import("./commands/db-backup.ts").then((command) => command.default),
    "db:restore": () => import("./commands/db-restore.ts").then((command) => command.default),
    "server:restore": () => import("./commands/server-restore.ts").then((command) => command.default),
    "dr:check": () => import("./commands/dr-check.ts").then((command) => command.default),
  },
  Monitoring: {
    "alerts:test": () => import("./commands/alerts-test.ts").then((command) => command.default),
  },
  Build: {
    build: () => import("./commands/build.ts").then((command) => command.default),
    "build:manifest": () => import("./commands/build-manifest.ts").then((command) => command.default),
    "build:verify": () => import("./commands/build-verify.ts").then((command) => command.default),
  },
  Maintenance: {
    down: () => import("./commands/down.ts").then((command) => command.default),
    up: () => import("./commands/up.ts").then((command) => command.default),
    "maintenance:status": () => import("./commands/maintenance-status.ts").then((command) => command.default),
  },
  Secrets: {
    "key:generate": () => import("./commands/key-generate.ts").then((command) => command.default),
    "key:rotate": () => import("./commands/key-rotate.ts").then((command) => command.default),
    "push:keys": () => import("./commands/push-keys.ts").then((command) => command.default),
  },
  "API keys": {
    "key:issue": () => import("./commands/key-issue.ts").then((command) => command.default),
  },
};

const subCommands: SubCommandsDef = Object.fromEntries(Object.values(commandGroups).flatMap(Object.entries));

const description = "Production-ready backend for Nuxt: database, typed API, validation, auth, and actions.";

const main = defineCommand({
  meta: {
    name: "nuxvel",
    version: pkg.version,
    description,
  },
  subCommands,
});

async function resolveCommand(loader: Resolvable<CommandDef>) {
  return typeof loader === "function" ? await loader() : await loader;
}

async function summary(loader: Resolvable<CommandDef>) {
  const { meta } = await resolveCommand(loader);
  const resolved = typeof meta === "function" ? await meta() : await meta;
  return (resolved?.description ?? "").split(". ")[0]?.replace(/\.$/, "") ?? "";
}

async function renderCommandList() {
  const width = Math.max(...Object.keys(subCommands).map((name) => name.length)) + 2;
  const sections = await Promise.all(
    Object.entries(commandGroups).map(async ([group, commands]) => {
      const rows = await Promise.all(
        Object.entries(commands).map(async ([name, loader]) => `  ${colors.cyan(name.padEnd(width))}${await summary(loader)}`),
      );
      return [colors.bold(group), ...rows].join("\n");
    }),
  );
  return sections.join("\n\n");
}

async function renderHelp(rawArgs: string[]) {
  const name = commandName(rawArgs);
  const subCommand = name !== undefined && Object.hasOwn(subCommands, name) ? subCommands[name] : undefined;

  if (subCommand) return renderUsage(await resolveCommand(subCommand), main);

  return [
    colors.gray(`${description} (nuxvel v${pkg.version})`),
    "",
    `${colors.underline(colors.bold("USAGE"))} ${colors.cyan("nuxvel <command> [OPTIONS]")}`,
    "",
    await renderCommandList(),
    "",
    `Run ${colors.cyan("nuxvel <command> --help")} for the usage of one command.`,
  ].join("\n");
}

const PASSTHROUGH_COMMANDS = new Set(["test", "test:e2e", "test:ui", "dev", "db:generate", "db:studio"]);

function forwardsHelp(rawArgs: string[], name: string) {
  return PASSTHROUGH_COMMANDS.has(name) && rawArgs.findIndex(isHelpArg) > rawArgs.indexOf(name);
}

async function reportUnknownCommand(name: string) {
  const suggestions = Object.keys(subCommands).filter((command) => command.includes(name)).slice(0, 3);
  const hintText = suggestions.length > 0 ? `Did you mean ${suggestions.map((command) => `nuxvel ${command}`).join(", ")}?` : "Run nuxvel --help to list commands";

  error(`Unknown command "${name}"`, hintText);
  report();
  report(await renderCommandList());
  process.exitCode = 2;
}

async function run(rawArgs: string[]) {
  if (rawArgs.length === 1 && (rawArgs[0] === "--version" || rawArgs[0] === "-v")) {
    print(pkg.version);
    return;
  }

  const name = commandName(rawArgs);

  if (name === "help") {
    print(`${await renderHelp(rawArgs.slice(rawArgs.indexOf(name) + 1))}\n`);
    return;
  }

  if (name === undefined || (asksForHelp(rawArgs) && !forwardsHelp(rawArgs, name))) {
    print(`${await renderHelp(rawArgs)}\n`);
    return;
  }

  const subCommand = Object.hasOwn(subCommands, name) ? subCommands[name] : undefined;

  if (subCommand === undefined) return reportUnknownCommand(name);

  const nameIndex = rawArgs.indexOf(name);
  const commandArgs = await askMissingArgs(await resolveCommand(subCommand), rawArgs.slice(nameIndex + 1));

  await runCommand(main, { rawArgs: [...rawArgs.slice(0, nameIndex + 1), ...commandArgs] });
}

const rawArgs = process.argv.slice(2);

await run(rawArgs).catch((failure: unknown) => {
  const exitCode = reportFailure(failure, rawArgs);
  process.stderr.write("", () => process.exit(exitCode));
});
