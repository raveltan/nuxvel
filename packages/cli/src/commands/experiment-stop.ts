import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "experiment:stop",
    description: "Stop an experiment: everyone gets the control and no exposure is recorded.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the experiment, e.g. checkout-cta.",
      required: true,
    },
  },
  async run({ args }) {
    process.exitCode = await runCommandInApp(process.cwd(), { kind: "experiment:stop", name: args.name });
  },
});
