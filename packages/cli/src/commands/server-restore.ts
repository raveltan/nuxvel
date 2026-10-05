import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { REHEARSALS_FILE, recordRehearsal } from "../deploy/rehearsal-record.ts";
import { appScript } from "../server/app-script.ts";
import { askRecoveryKey } from "../server/ask-recovery-key.ts";
import { changeReport } from "../server/change-report.ts";
import { rehearse } from "../server/rehearse.ts";
import { serverRestoreScript } from "../server/restore-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { setupServer } from "../server/setup-server.ts";
import { fail } from "../ui/fail.ts";
import { print, printLine, report, success } from "../ui/output.ts";

type RestoredApp = { name: string; stamp: string; domains: string[]; redirects: Record<string, string>; filesDomain: string | null };

export default defineCommand({
  meta: {
    name: "server:restore",
    description: "Rebuild a lost server of an environment from its off-site backups: set it up, then restore every app on it.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
    from: {
      type: "string",
      description:
        "The backups to restore: latest (the default) or a time, e.g. 20260927T020312Z. <env>:<latest or time>, e.g. production:latest, rehearses the restore of that environment's app next to this server's own, then removes it.",
      default: "latest",
    },
  },
  async run({ args }) {
    const rehearsal = /^([a-z][\w-]*):(latest|\d{8}T\d{6}Z)$/.exec(args.from);
    if (args.from !== "latest" && !/^\d{8}T\d{6}Z$/.test(args.from) && !rehearsal) {
      fail(`--from must be latest, the time of a backup like 20260927T020312Z, or <env>:<latest or time> for a rehearsal, got "${args.from}"`, {
        exitCode: 2,
      });
    }
    const cwd = process.cwd();
    if (rehearsal) {
      const source = rehearsal[1] ?? "";
      const result = await rehearse(cwd, args.env, source, rehearsal[2] ?? "latest");
      recordRehearsal(cwd, source, { time: new Date().toISOString(), on: args.env, backup: result.stamp, minutes: result.minutes, steps: result.steps });
      report(`Recorded in ${REHEARSALS_FILE}: commit it, nuxvel doctor warns when the last rehearsal of ${source} is older than 90 days`);
      return;
    }
    const { environment, server } = await loadEnvironment(cwd, args.env);
    if (!environment.backups?.offsite) {
      fail(`server:restore reads the off-site backups, and ${args.env} has no backups.offsite`, {
        hint: "Set backups.offsite in nuxvel.deploy.ts to the bucket that holds them",
      });
    }
    const recoveryKey = await askRecoveryKey("server:restore");
    const started = Date.now();
    const target = sshTarget(cwd, server, "root");

    await runOverSsh(target, serverRestoreScript("key", { recoveryKey }), print, { failure: "Installing the recovery key failed" });
    await setupServer({ cwd, environment, server, dryRun: false });

    const apps: RestoredApp[] = [];
    try {
      await runOverSsh(
        target,
        serverRestoreScript("fetch", { recoveryKey, from: args.from, deployUser: server.user, env: args.env }),
        (line) => {
          if (line.startsWith("@app ")) apps.push(JSON.parse(line.slice("@app ".length)));
          else print(line);
        },
        { failure: "Reading the off-site backups failed" },
      );
      for (const app of apps) {
        report(`Restoring ${app.name} from its backup ${app.stamp}`);
        const changes = changeReport();
        await runOverSsh(
          target,
          appScript({
            dryRun: false,
            deployUser: server.user,
            app: app.name,
            domains: app.domains,
            redirects: app.redirects,
            filesDomain: app.filesDomain ?? undefined,
            restoreDrill: false,
          }),
          changes.line,
          { failure: `Creating ${app.name} failed` },
        );
        await runOverSsh(
          target,
          serverRestoreScript("apply", { app: app.name, deployUser: server.user, env: args.env }),
          printLine,
          { failure: `Restoring ${app.name} failed` },
        );
      }
    } finally {
      await runOverSsh(target, serverRestoreScript("clean", {}), print, { failure: "Removing the restore files failed" });
    }

    const minutes = ((Date.now() - started) / 60000).toFixed(1);
    success(`Restored ${apps.map(({ name }) => name).join(", ")} on ${server.host} in ${minutes} min`);
  },
});
