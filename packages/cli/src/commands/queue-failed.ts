import { failedJobsListingSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { hint, report } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

export default defineCommand({
  meta: {
    name: "queue:failed",
    description: "List the jobs that exhausted their retries.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const listing = await loadFromApp(
      process.cwd(),
      (outFile) => ({ kind: "queue:failed", outFile }),
      failedJobsListingSchema,
    );

    if (!listing) {
      process.exitCode = 1;
      return;
    }

    if (args.json) {
      printJson(listing);
      return;
    }

    if (listing.jobs.length === 0) {
      report("No failed jobs");
      return;
    }

    printTable(
      ["QUEUE", "ID", "NAME", "ATTEMPTS", "FAILED AT", "REASON"],
      listing.jobs.map((job) => [job.queue, job.id, job.name, String(job.attempts), job.failedAt ?? "-", job.reason]),
    );
    report(hint("Once the cause is fixed, run nuxvel queue:retry <id>, or nuxvel queue:retry all"));
  },
});
