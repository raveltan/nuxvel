import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "experiment:start",
    description: "Start an experiment, locking its variant weights; the change is audit-logged.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the experiment, e.g. checkout-cta.",
      required: true,
    },
  },
  async run({ args }) {
    process.exitCode = await runCommandInApp(process.cwd(), { kind: "experiment:start", name: args.name });
  },
});
