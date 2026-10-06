import type { DomainEvent } from "../events/define-event";
import { type Named, named, namedOnRead } from "./definition-name";
import { isRenamed } from "./renamed";

type ValuesOf<Module> = Module extends unknown ? Module[keyof Module] : never;

type EventOf<Module> = Extract<ValuesOf<Module>, DomainEvent>;

type Discovered<Modules extends readonly (readonly [object, string, string])[]> = {
  [Index in keyof Modules]: Named<EventOf<Modules[Index][0]>, Modules[Index][2]>;
}[number];

function isEvent(value: unknown): value is DomainEvent {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "event";
}

/**
 * Names the {@link defineEvent} event each discovered `server/events/`
 * module exports after the module's path, throwing when one exports
 * more than one. The generated `#nuxvel/events` module calls it, and
 * the events are named on the first read of the array, or at boot.
 */
export function discoveredEvents<const Modules extends readonly (readonly [object, string, string])[]>(
  modules: Modules,
): Discovered<Modules>[] {
  return namedOnRead(() => modules.flatMap(([module, file, name]) => {
    if (Object.values(module).some(isRenamed)) {
      throw new Error(`nuxvel: ${file} exports renamed(), but an event stores nothing under its name; delete the old file`);
    }

    const events = Object.values(module).filter(isEvent);

    if (events.length > 1) {
      throw new Error(`nuxvel: ${file} exports ${events.length} events; an event is named after its file, so give each its own`);
    }

    // each event is named after its module's entry, which is what Discovered<> maps
    return events.map((event) => named(event, name, file) as Discovered<Modules>);
  }));
}
