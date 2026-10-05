import { scheduleListingSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { plural, report, warn } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

type Schedule = { name: string; storedAs: string; nextRun: string | null; orphaned: boolean };

function note(schedule: Schedule) {
  if (schedule.orphaned) return "orphaned, no defineSchedule in code";
  if (schedule.storedAs !== schedule.name) return `stored as ${schedule.storedAs}`;
  if (schedule.nextRun === null) return "not registered, run queue:work";
  return "";
}

export default defineCommand({
  meta: {
    name: "schedule:list",
    description: "List the schedules discovered under server/schedules with their next run, flagging orphaned entries in Redis.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const listing = await loadFromApp(
      process.cwd(),
      (outFile) => ({ kind: "schedule:list", outFile }),
      scheduleListingSchema,
    );

    if (!listing) {
      process.exitCode = 1;
      return;
    }

    if (args.json) {
      printJson(listing);
      return;
    }

    if (listing.schedules.length === 0) {
      report("No schedules discovered under server/schedules");
      return;
    }

    printTable(
      ["NAME", "RUNS", "NEXT RUN", "NOTE"],
      listing.schedules.map((schedule) => [
        schedule.name,
        schedule.description ?? "-",
        schedule.nextRun ?? "-",
        note(schedule),
      ]),
    );

    const orphaned = listing.schedules.filter((schedule) => schedule.orphaned).length;

    if (orphaned > 0) {
      warn(
        `${plural(orphaned, "orphaned schedule")} in Redis`,
        "Run nuxvel schedule:prune once every worker runs this code",
      );
    }
  },
});
