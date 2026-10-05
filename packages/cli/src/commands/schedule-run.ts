import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "schedule:run",
    description: "Run one tick of a schedule from server/schedules now, without the worker.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the schedule, e.g. posts.prune-drafts.",
      required: true,
    },
  },
  async run({ args }) {
    process.exitCode = await runCommandInApp(process.cwd(), { kind: "schedule:run", name: args.name });
  },
});
