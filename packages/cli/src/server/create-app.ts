import type { DeployEnvironment } from "../deploy/define-deploy.ts";
import { appScript } from "./app-script.ts";
import { changeReport } from "./change-report.ts";
import { runOverSsh, sshTarget } from "./run-over-ssh.ts";

export async function createApp(options: {
  cwd: string;
  app: string;
  environment: DeployEnvironment;
  server: DeployEnvironment["servers"][number];
  dryRun: boolean;
}) {
  const { app, environment, server, dryRun } = options;
  const target = sshTarget(options.cwd, server, "root");
  const destination = `root@${server.host}`;
  const changes = changeReport();

  await runOverSsh(
    target,
    appScript({
      dryRun,
      deployUser: server.user,
      app,
      domains: environment.domains,
      redirects: environment.redirects,
      filesDomain: environment.filesDomain,
      restoreDrill: environment.backups?.restoreDrill === true,
    }),
    changes.line,
  );

  changes.finish({ subject: `${app} on ${destination}`, destination, dryRun });
}
