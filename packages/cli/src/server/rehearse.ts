import { loadEnvironment } from "../deploy/load-environment.ts";
import { fail } from "../ui/fail.ts";
import { print, printLine, success, warn } from "../ui/output.ts";
import { appScript } from "./app-script.ts";
import { askRecoveryKey } from "./ask-recovery-key.ts";
import { changeReport } from "./change-report.ts";
import { destroyScript } from "./destroy-script.ts";
import { offsiteEnv } from "./offsite-env.ts";
import { rehearsalScript } from "./rehearsal-script.ts";
import { runOverSsh, sshTarget } from "./run-over-ssh.ts";

/**
 * The outcome of {@link rehearse}.
 */
export interface Rehearsal {
  stamp: string;
  minutes: number;
  steps: { what: string; seconds: number }[];
}

export async function rehearse(cwd: string, envName: string, sourceName: string, from: string): Promise<Rehearsal> {
  const { app, server } = await loadEnvironment(cwd, envName);
  const { environment: source } = await loadEnvironment(cwd, sourceName);
  if (!source.backups?.offsite) {
    fail(`A rehearsal reads the off-site backups of ${sourceName}, and it has no backups.offsite`, {
      hint: "Set backups.offsite in nuxvel.deploy.ts to the bucket that holds them",
    });
  }
  const recoveryKey = await askRecoveryKey("server:restore");
  const started = Date.now();
  const target = sshTarget(cwd, server, "root");
  const rehearsal = `${app}-rehearsal`;
  const steps: Rehearsal["steps"] = [];
  let stamp = "";
  let leftover = false;
  const onLine = (line: string) => {
    if (line.startsWith("@step ")) steps.push(JSON.parse(line.slice("@step ".length)));
    else if (line.startsWith("@stamp ")) stamp = line.slice("@stamp ".length);
    else if (line === "@leftover") leftover = true;
    else printLine(line);
  };
  const removeRehearsal = () =>
    runOverSsh(target, destroyScript({ app: rehearsal, finalBackup: false }), print, { failure: `Removing ${rehearsal} failed` });

  await runOverSsh(
    target,
    rehearsalScript("prepare", { APP: app, RECOVERY_KEY: recoveryKey, OFFSITE: offsiteEnv(source.backups.offsite) }),
    onLine,
    { failure: "Preparing the rehearsal failed" },
  );
  try {
    if (leftover) {
      warn(`Removing ${rehearsal}, left by an earlier rehearsal`);
      await removeRehearsal();
    }
    await runOverSsh(target, rehearsalScript("fetch", { APP: app, FROM: from, ENV: envName }), onLine, {
      failure: `Reading the off-site backups of ${sourceName} failed`,
    });
    print(`Rehearsing the restore of ${app} from its backup ${stamp} of ${sourceName}, as ${rehearsal} next to ${app}`);
    const changes = changeReport();
    try {
      await runOverSsh(
        target,
        appScript({ dryRun: false, deployUser: server.user, app: rehearsal, domains: [], redirects: {}, filesDomain: undefined, restoreDrill: false }),
        changes.line,
        { failure: `Creating ${rehearsal} failed` },
      );
      await runOverSsh(target, rehearsalScript("apply", { APP: app, DEPLOY_USER: server.user, ENV: envName }), onLine, {
        failure: `The rehearsal of ${app} failed`,
      });
    } finally {
      await removeRehearsal();
    }
  } finally {
    await runOverSsh(target, rehearsalScript("clean", {}), print, { failure: "Removing the rehearsal files failed" });
  }

  const minutes = Number(((Date.now() - started) / 60000).toFixed(1));
  success(`Rehearsed the restore of ${app} from ${sourceName} on ${server.host} in ${minutes} min, and removed ${rehearsal}`);

  return { stamp, minutes, steps };
}
