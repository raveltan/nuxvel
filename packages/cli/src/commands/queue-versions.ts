import { queueVersionsListingSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { plural, report, warn } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

function versionLabel(group: { version: number | null; schedule: boolean }) {
  if (group.schedule) return "cron";
  return group.version === null ? "v?" : `v${group.version}`;
}

export default defineCommand({
  meta: {
    name: "queue:versions",
    description: "List the jobs on the queue grouped by payload version, with how many are delayed or prioritized, flagging versions no upcaster can migrate.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const listing = await loadFromApp(
      process.cwd(),
      (outFile) => ({ kind: "queue:versions", outFile }),
      queueVersionsListingSchema,
    );

    if (!listing) {
      process.exitCode = 1;
      return;
    }

    if (args.json) {
      printJson(listing);
      return;
    }

    if (listing.groups.length === 0) {
      report("No pending jobs on the queue");
      return;
    }

    printTable(
      ["NAME", "VERSION", "JOBS", "DELAYED", "PRIORITIZED", "PROBLEM"],
      listing.groups.map((group) => [
        group.name,
        versionLabel(group),
        String(group.count),
        String(group.delayed),
        String(group.prioritized),
        group.problem ?? "",
      ]),
    );

    const flagged = listing.groups.filter((group) => group.problem !== null).length;

    if (flagged > 0) {
      warn(
        `${plural(flagged, "group")} the current code cannot run`,
        "Add an upcaster or a renamed() alias, or let those jobs drain before deploying",
      );
    }
  },
});
