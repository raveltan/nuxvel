import { flagsListingSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { report } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

export default defineCommand({
  meta: {
    name: "flags:list",
    description: "List every flag with its default and current targeting, and every experiment with its variants.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const listing = await loadFromApp(process.cwd(), (outFile) => ({ kind: "flags:list", outFile }), flagsListingSchema);

    if (!listing) {
      process.exitCode = 1;
      return;
    }

    if (args.json) {
      printJson(listing);
      return;
    }

    if (listing.flags.length === 0 && listing.experiments.length === 0) {
      report("No flags or experiments discovered under server/flags");
      return;
    }

    printTable(["NAME", "KIND", "DEFAULT", "TARGETING", "STATUS"], [
      ...listing.flags.map((flag) => [flag.name, "flag", String(flag.default), flag.targeting, "-"]),
      ...listing.experiments.map((experiment) => [
        experiment.name,
        "experiment",
        "-",
        Object.entries(experiment.variants)
          .map(([variant, weight]) => `${variant}:${weight}`)
          .join(" "),
        experiment.status,
      ]),
    ]);
  },
});
