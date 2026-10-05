import { defineCommand } from "citty";
import { goLive, openDeploy } from "../deploy/deploy-session.ts";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { planColor } from "../deploy/plan-color.ts";
import { rotateScript } from "../server/rotate-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { print, printLine, success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "app:rotate-credentials",
    description: "Give the app new database, Redis and S3 credentials, deploy its live release with them, then revoke the old ones.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { app, environment, server } = await loadEnvironment(cwd, args.env);
    const deploy = { cwd, envName: args.env, app, environment, server };
    const root = sshTarget(cwd, server, "root");
    const options = { deployUser: server.user, app };

    const session = await openDeploy(deploy, { createMissing: false });
    try {
      const state = session.server.states[app];
      const live = state?.active ? state.releases[state.active] : null;
      if (!live) fail(`${app} has no live release on ${server.host}`, { hint: `Deploy it first with nuxvel deploy ${args.env}` });

      await runOverSsh(root, rotateScript("add", options), printLine, { failure: "Making the new credentials failed" });
      print(`Deploying ${live} of ${app} again with the new credentials, the old ones still work`);
      try {
        await goLive(deploy, session, planColor(app, environment, session.server), live);
      } catch (error) {
        print(`The old and the new credentials of ${app} both still work: run nuxvel app:rotate-credentials ${args.env} again`);
        throw error;
      }
    } finally {
      await session.release();
    }

    await runOverSsh(root, rotateScript("revoke", options), printLine, { failure: "Revoking the old credentials failed" });
    success(`Rotated the database, Redis and S3 credentials of ${app} on ${server.host}`);
  },
});
