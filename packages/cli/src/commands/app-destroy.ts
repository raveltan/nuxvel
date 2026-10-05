import * as clack from "@clack/prompts";
import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { destroyScript } from "../server/destroy-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { print, success } from "../ui/output.ts";

async function confirmAppName(app: string, destination: string) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    fail("app:destroy needs the app name typed in a terminal", { hint: `Run it in a terminal and type ${app}` });
  }

  const answer = await clack.text({ message: `Type ${app} to destroy it and its data on ${destination}`, output: process.stderr });

  if (answer !== app) fail(`Cancelled: ${app} on ${destination} is unchanged`);
}

export default defineCommand({
  meta: {
    name: "app:destroy",
    description: "Back up the app on the server of an environment, then remove it and its data.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
  },
  async run({ args }) {
    const { app, server } = await loadEnvironment(process.cwd(), args.env);
    const target = sshTarget(process.cwd(), server, "root");
    const destination = `root@${server.host}`;

    await confirmAppName(app, destination);
    await runOverSsh(target, destroyScript({ app }), print);

    success(`Removed ${app} from ${destination}`);
  },
});
