import { backfillListingSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { report } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

export default defineCommand({
  meta: {
    name: "backfill:status",
    description: "Show each backfill's rows processed out of its total, its cursor, and whether it finished.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const listing = await loadFromApp(
      process.cwd(),
      (outFile) => ({ kind: "backfill:status", outFile }),
      backfillListingSchema,
    );

    if (!listing) {
      process.exitCode = 1;
      return;
    }

    if (args.json) {
      printJson(listing);
      return;
    }

    if (listing.backfills.length === 0) {
      report("No backfill has run yet");
      return;
    }

    printTable(
      ["NAME", "ROWS", "CURSOR", "STATE"],
      listing.backfills.map((backfill) => [
        backfill.name,
        `${backfill.processed}/${backfill.total}`,
        backfill.cursor === null || backfill.cursor === undefined ? "none" : JSON.stringify(backfill.cursor),
        backfill.completedAt ? "done" : "in progress",
      ]),
    );
  },
});
