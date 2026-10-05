import { defineCommand } from "citty";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { createApp } from "../server/create-app.ts";

export default defineCommand({
  meta: {
    name: "app:create",
    description: "Create the app's resources on the server of an environment. Running it again changes nothing.",
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
    const cwd = process.cwd();
    const { app, environment, server } = await loadEnvironment(cwd, args.env);

    await createApp({ cwd, app, environment, server, dryRun: args["dry-run"] === true });
  },
});
