import { staleFlagsListingSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { unreferencedFlags } from "../flags/unreferenced-flags.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { report } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

export default defineCommand({
  meta: {
    name: "flag:stale",
    description: "List flags past their expiresAt, fully rolled out for over 30 days, or referenced by no code.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const loaded = await loadFromApp(
      process.cwd(),
      (outFile) => ({ kind: "flags:stale", now: new Date().toISOString(), outFile }),
      staleFlagsListingSchema,
    );

    if (!loaded) {
      process.exitCode = 1;
      return;
    }

    const stale = new Set(loaded.flags.map((flag) => flag.name));
    const unreferenced = unreferencedFlags(process.cwd(), loaded.names.filter((name) => !stale.has(name)));
    const listing = {
      flags: [...loaded.flags, ...unreferenced.map((name) => ({ name, reason: "unreferenced" as const, since: null }))],
    };

    if (args.json) {
      printJson(listing);
      return;
    }

    if (listing.flags.length === 0) {
      report("No stale flags");
      return;
    }

    printTable(
      ["NAME", "STALE", "SINCE"],
      listing.flags.map((flag) => [flag.name, flag.reason, flag.since ?? "-"]),
    );
  },
});
