import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "queue:retry",
    description: "Re-enqueue a failed job by id, or every failed job with `all`.",
  },
  args: {
    target: {
      type: "positional",
      description: "Id of the failed job to retry, or `all`.",
      required: true,
    },
    queue: {
      type: "string",
      description: "Only look in this queue. Needed when two queues have a failed job with the same id.",
    },
  },
  async run({ args }) {
    process.exitCode = await runCommandInApp(process.cwd(), { kind: "queue:retry", target: args.target, queue: args.queue });
  },
});
