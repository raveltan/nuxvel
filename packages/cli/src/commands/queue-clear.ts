import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";
import { askConfirm } from "../ui/ask-missing-args.ts";

export default defineCommand({
  meta: {
    name: "queue:clear",
    description: "Remove the waiting and failed jobs of every queue, or of the queues --queue lists.",
  },
  args: {
    failed: { type: "boolean", description: "Remove only the failed jobs.", default: false },
    waiting: { type: "boolean", description: "Remove only the waiting, prioritized and delayed jobs.", default: false },
    queue: { type: "string", description: "Comma-separated queues to clear, such as mail,default. Defaults to every queue." },
    force: { type: "boolean", description: "Remove the jobs without asking.", default: false },
  },
  async run({ args }) {
    const both = args.failed === args.waiting;
    const failed = both || args.failed;
    const waiting = both || args.waiting;
    const queues = args.queue?.split(",").map((queue) => queue.trim()).filter(Boolean);
    const kinds = [waiting && "waiting", failed && "failed"].filter(Boolean).join(" and ");

    const what = `the ${kinds} jobs of ${queues?.join(", ") ?? "every queue"}`;

    if (!args.force) await askConfirm(`Remove ${what}?`, `queue:clear removes ${what} and needs a confirmation`, "Cancelled: the queues are unchanged");

    process.exitCode = await runCommandInApp(process.cwd(), { kind: "queue:clear", queues, failed, waiting });
  },
});
