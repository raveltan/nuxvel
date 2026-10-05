import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { setupServer } from "../server/setup-server.ts";

export default defineCommand({
  meta: {
    name: "server:setup",
    description: "Set up the Ubuntu 26.04 server of an environment over SSH. Running it again changes nothing.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
    "dry-run": {
      type: "boolean",
      description: "Show the changes and make none.",
    },
  },
  async run({ args }) {
    const { environment, server } = await loadEnvironment(process.cwd(), args.env);

    await setupServer({ cwd: process.cwd(), environment, server, dryRun: args["dry-run"] === true });
  },
});
