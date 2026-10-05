import { billingListingSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { report } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

export default defineCommand({
  meta: {
    name: "billing:status",
    description:
      "Show how many Stripe events the app stored, and each one that is not processed yet with its attempts and last error. Exits 1 when one of them failed.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const listing = await loadFromApp(process.cwd(), (outFile) => ({ kind: "billing:status", outFile }), billingListingSchema);

    if (!listing) {
      process.exitCode = 1;
      return;
    }

    if (listing.pending.some((event) => event.lastError !== null)) process.exitCode = 1;

    if (args.json) {
      printJson(listing);
      return;
    }

    report(`${listing.total} Stripe events stored, ${listing.pending.length} not processed`);

    if (listing.pending.length === 0) return;

    printTable(
      ["EVENT", "TYPE", "RECEIVED", "ATTEMPTS", "LAST ERROR"],
      listing.pending.map((event) => [event.id, event.type, event.receivedAt, String(event.attempts), event.lastError ?? ""]),
    );
  },
});
