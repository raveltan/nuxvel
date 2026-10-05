import { defineCommand } from "citty";
import { runWorkerInApp } from "../app-server/run-in-app.ts";
import { fail } from "../ui/fail.ts";

export default defineCommand({
  meta: {
    name: "queue:work",
    description: "Run the jobs discovered under server/jobs as they are dispatched.",
  },
  args: {
    concurrency: {
      type: "string",
      description: "How many jobs to run at once. Defaults to 5.",
      default: "5",
    },
    queue: {
      type: "string",
      description: "Comma-separated queues to run, such as mail,default. Defaults to every queue a job uses.",
    },
  },
  async run({ args }) {
    const concurrency = Number(args.concurrency);

    if (!Number.isInteger(concurrency) || concurrency < 1) {
      fail("--concurrency must be a whole number of at least 1", { hint: "e.g. --concurrency 10", exitCode: 2 });
    }

    process.exitCode = await runWorkerInApp(process.cwd(), concurrency, args.queue);
  },
});
