import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh, sshTarget } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { print } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "logs",
    description: "Stream the logs of the app's live web processes, its workers or its Caddy access log on the server.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
    worker: {
      type: "boolean",
      description: "Stream the logs of the live workers instead of the web processes.",
    },
    caddy: {
      type: "boolean",
      description: "Stream Caddy's JSON access log of the app instead.",
    },
    lines: {
      type: "string",
      description: "How many earlier lines to print first (default 50).",
      default: "50",
    },
  },
  async run({ args }) {
    if (args.worker && args.caddy) fail("Pass --worker or --caddy, not both", { exitCode: 2 });
    if (!/^\d+$/.test(args.lines)) fail(`--lines must be a number, got "${args.lines}"`, { exitCode: 2 });

    const cwd = process.cwd();
    const { app, server } = await loadEnvironment(cwd, args.env);
    const source = args.caddy ? "caddy" : args.worker ? "worker" : "web";

    await runOverSsh(
      sshTarget(cwd, server),
      deployScript("logs", { APP: app, APP_DIR: `/srv/apps/${app}`, SOURCE: source, LINES: args.lines }),
      print,
      { failure: "Streaming the logs failed" },
    );
  },
});
