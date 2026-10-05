import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { spawnSsh, sshTarget } from "../server/run-over-ssh.ts";

export default defineCommand({
  meta: {
    name: "ssh",
    description: "Open a shell as the deploy user in the app's folder on the server of an environment.",
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
    const { app, server } = await loadEnvironment(cwd, args.env);
    const ssh = spawnSsh(sshTarget(cwd, server), `cd /srv/apps/${app} && exec bash -l`, {
      terminal: process.stdin.isTTY === true,
      stdio: "inherit",
    });

    process.exitCode = await ssh.exited();
  },
});
