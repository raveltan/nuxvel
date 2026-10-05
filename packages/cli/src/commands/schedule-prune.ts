import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "schedule:prune",
    description: "Remove the schedules in Redis that no defineSchedule under server/schedules matches any more.",
  },
  args: {
    "dry-run": {
      type: "boolean",
      description: "List the orphaned schedules and remove none.",
      default: false,
    },
  },
  async run({ args }) {
    process.exitCode = await runCommandInApp(process.cwd(), { kind: "schedule:prune", dryRun: args["dry-run"] });
  },
});
