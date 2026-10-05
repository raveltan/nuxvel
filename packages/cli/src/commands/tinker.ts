import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { liveRelease, runInRelease } from "../deploy/run-in-release.ts";
import { askConfirm } from "../ui/ask-missing-args.ts";

async function tinkerOnServer(cwd: string, envName: string, force: boolean) {
  const release = await liveRelease(cwd, envName);

  if (!force) {
    await askConfirm(
      `Open a REPL on ${release.app} in ${envName} (${release.host})? What you run there changes its live data`,
      `tinker ${envName} runs code against the live data of ${release.app} and needs a confirmation`,
      "Cancelled: no REPL was opened",
    );
  }

  return (await runInRelease(release)).code;
}

export default defineCommand({
  meta: {
    name: "tinker",
    description:
      "Open a REPL with the app's database, actions, policies, and schemas already in scope, locally or, with an environment, on its server after a confirmation.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production. Without it, the REPL runs locally.",
      required: false,
    },
    force: {
      type: "boolean",
      description: "Open the REPL on the server without asking.",
    },
  },
  async run({ args }) {
    process.exitCode = args.env
      ? await tinkerOnServer(process.cwd(), args.env, args.force === true)
      : await runCommandInApp(process.cwd(), { kind: "tinker" });
  },
});
