import { defineCommand } from "citty";
import { runCommandInApp } from "../app-server/run-in-app.ts";

export default defineCommand({
  meta: {
    name: "billing:replay",
    description: "Process a stored Stripe event again now, in the app's server, as the nuxvel.billing.process-event job does.",
  },
  args: {
    eventId: {
      type: "positional",
      description: "ID of the Stripe event, e.g. evt_1PqR. nuxvel billing:status lists the ones not processed.",
      required: true,
    },
  },
  async run({ args }) {
    process.exitCode = await runCommandInApp(process.cwd(), { kind: "billing:replay", eventId: args.eventId });
  },
});
