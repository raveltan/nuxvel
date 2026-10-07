import { relative } from "node:path";
import { defineCommand } from "citty";
import { loadAppLayout } from "../app-layout/load-app-layout.ts";
import { EVENT_FOLDERS, listEvents } from "../events/list-events.ts";
import { fail } from "../ui/fail.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { report, warn } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";
import { errorMessage } from "../error-message.ts";

export default defineCommand({
  meta: {
    name: "event:list",
    description: "List the events discovered under server/events with the server files that emit them and their listeners, warning on any event nothing listens for.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const cwd = process.cwd();
    const layout = await loadAppLayout(cwd, EVENT_FOLDERS).catch((error: unknown) =>
      fail(`Could not load the app:\n${errorMessage(error)}`, {
        hint: "Run nuxt prepare in the app to see the error in context",
      }),
    );

    const events = listEvents(layout).map((listing) => ({
      ...listing,
      source: relative(cwd, listing.source),
      emitters: listing.emitters.map((emitter) => relative(cwd, emitter)),
    }));

    if (args.json) {
      printJson({ events });
      return;
    }

    if (events.length === 0) {
      report("No events discovered under server/events");
      return;
    }

    printTable(
      ["EVENT", "SOURCE", "EMITTED BY", "LISTENERS"],
      events.map((event) => [
        event.name,
        event.source,
        event.emitters.join(", ") || "nothing",
        event.listeners.map((listener) => `${listener.name} (${listener.sync ? "sync" : "queued"})`).join(", ") || "none",
      ]),
    );

    for (const event of events) {
      if (event.listeners.length === 0) warn(`${event.name} has no listener, nothing reacts to this event`);
    }
  },
});
