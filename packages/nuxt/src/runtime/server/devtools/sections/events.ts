import events from "#nuxvel/events";
import { allListeners, listenerAliases } from "../../events/registry";
import { defineDevtoolsSection } from "../define-devtools-section";
import { readableSchema } from "../readable-schema";
import type { DomainEvent } from "../../events/define-event";
import type { EventsSectionData } from "../../../shared/devtools/sections/events";

function catalog(): EventsSectionData {
  const registered: readonly DomainEvent[] = events;
  const aliases = listenerAliases();

  return [...registered]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((event) => ({
      name: event.name,
      version: event.version,
      payload: readableSchema(event.payload),
      listeners: allListeners()
        .filter((listener) => listener.event === event.name)
        .map((listener) => ({
          name: listener.name,
          mode: listener.sync ? "sync" : "queued",
          oldNames: aliases.filter((alias) => alias.renamedTo === listener).map((alias) => alias.name),
        })),
    }));
}

let cached: EventsSectionData | undefined;

export default defineDevtoolsSection<EventsSectionData>({
  id: "events",
  title: "Events and listeners",
  order: 40,
  load: async () => {
    cached ??= catalog();

    return cached;
  },
});
