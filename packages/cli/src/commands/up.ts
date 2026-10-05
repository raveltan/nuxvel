import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { liveRelease, runInRelease } from "../deploy/run-in-release.ts";
import { askConfirm } from "../ui/ask-missing-args.ts";

/**
 * `nuxvel up` takes the app out of maintenance mode and resumes the queue.
 *
 * Without an environment, it runs inside the local app. With one, it runs over SSH in the live release on the server
 * of that environment, after a confirmation. `--force` skips the confirmation. Without a terminal, it needs `--force`.
 *
 * @example
 * ```sh
 * nuxvel up production --force
 * ```
 */
export default defineCommand({
  meta: {
    name: "up",
    description: "Take the app out of maintenance mode and resume the queue, locally or, with an environment, on its server.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production. Without it, the command runs locally.",
      required: false,
    },
    force: {
      type: "boolean",
      description: "Run it on the server without asking.",
    },
  },
  async run({ args }) {
    if (!args.env) {
      process.exitCode = await runCommandInApp(process.cwd(), { kind: "up" });
      return;
    }

    const release = await liveRelease(process.cwd(), args.env);

    if (args.force !== true) {
      await askConfirm(
        `Take ${release.app} in ${args.env} (${release.host}) out of maintenance mode?`,
        `up ${args.env} takes ${release.app} out of maintenance mode and needs a confirmation`,
        "Cancelled: the app stays in maintenance mode",
      );
    }

    process.exitCode = (await runInRelease(release, { kind: "up" })).code;
  },
});
