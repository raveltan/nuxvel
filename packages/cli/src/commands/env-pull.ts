import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { envHash, localEnvFile, pulledHashFile, readSharedEnv } from "../deploy/shared-env-file.ts";
import { sshTarget } from "../server/run-over-ssh.ts";
import { success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "env:pull",
    description: "Copy shared/.env of the app on the server of an environment to .nuxvel/<env>.env.",
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
    const contents = await readSharedEnv(sshTarget(cwd, server), app);
    const file = localEnvFile(args.env);

    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), contents, { mode: 0o600 });
    chmodSync(join(cwd, file), 0o600);
    writeFileSync(join(cwd, pulledHashFile(args.env)), envHash(contents));
    success(`Wrote shared/.env of ${app} on ${server.host} to ${file}`);
  },
});
