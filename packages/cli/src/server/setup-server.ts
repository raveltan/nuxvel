import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import type { DeployEnvironment } from "../deploy/define-deploy.ts";
import { KNOWN_HOSTS_FILE, pinnedHostKey } from "./known-hosts.ts";
import { changeReport } from "./change-report.ts";
import { runOverSsh, type SshTarget, sshTarget } from "./run-over-ssh.ts";
import { setupScript } from "./setup-script.ts";
import { fail } from "../ui/fail.ts";
import { hint, print, report, warn } from "../ui/output.ts";

function nodeMajor(cwd: string) {
  const file = join(cwd, ".nvmrc");
  const major = existsSync(file) ? /^v?(\d+)/.exec(readFileSync(file, "utf8").trim())?.[1] : undefined;

  if (!major) {
    fail(".nvmrc with a Node.js version not found", { hint: "The server runs the Node.js major of .nvmrc, e.g. 24" });
  }

  return major;
}

async function keepRecoveryKey(target: SshTarget, secretKey: string) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    fail("The new recovery key needs a confirmation in a terminal, so the server does not keep it", {
      hint: "Run server:setup in a terminal: it makes a new key",
    });
  }

  warn(
    "Recovery key, shown this one time. It decrypts the config backups of this server, which keeps only its public key:",
  );
  report(`\n  ${secretKey}\n`);

  const question = "Recovery key and off-site credentials stored outside the server?";
  let stored = await clack.confirm({ message: question, initialValue: false, output: process.stderr });
  while (stored !== true) {
    if (clack.isCancel(stored)) fail("The server does not keep the recovery key", { hint: "Run server:setup again for a new key" });
    stored = await clack.confirm({ message: question, initialValue: false, output: process.stderr });
  }

  await runOverSsh(target, "mv /etc/nuxvel/recovery.pub.pending /etc/nuxvel/recovery.pub\n", print);
}

export async function setupServer(options: {
  cwd: string;
  environment: DeployEnvironment;
  server: DeployEnvironment["servers"][number];
  dryRun: boolean;
}) {
  const { cwd, environment, server, dryRun } = options;
  const target = sshTarget(cwd, server, "root");
  const destination = `root@${server.host}`;
  const hostKeyWasPinned = pinnedHostKey(target.knownHosts, server.host) !== undefined;
  const script = setupScript({
    dryRun,
    arch: environment.arch,
    deployUser: server.user,
    nodeMajor: nodeMajor(cwd),
    logSink: environment.logs?.sink,
    offsite: environment.backups?.offsite,
    alerts: environment.alerts ? { server: server.host, ...environment.alerts } : undefined,
  });
  const changes = changeReport();
  let recoveryKey: string | undefined;

  await runOverSsh(target, script, (line) => {
    if (line.startsWith("recovery-key ")) {
      recoveryKey = line.slice("recovery-key ".length);
      return;
    }
    changes.line(line);
  });

  const hostKey = pinnedHostKey(target.knownHosts, server.host);
  if (!hostKeyWasPinned && hostKey) {
    report(`SSH host key of ${server.host}: ${hostKey}`);
    report(hint(`Pinned in ${KNOWN_HOSTS_FILE}: commit it, the CLI and CI refuse another key`));
  }

  if (recoveryKey) await keepRecoveryKey(target, recoveryKey);

  report("Add these URLs to an external uptime service, such as UptimeRobot or Better Stack:");
  for (const domain of environment.domains) print(`  https://${domain}/api/health/ready`);

  changes.finish({ subject: destination, destination, dryRun });
}
