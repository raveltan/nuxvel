import type { z } from "zod";
import type events from "#nuxvel/events";
import listeners from "#nuxvel/listeners";
import { aliasesIn, definitionsIn, resolveName } from "../discovery/aliases";
import type { Renamed } from "../discovery/renamed";
import type { DomainEvent } from "./define-event";
import type { Listener } from "./define-listener";

type DiscoveredEvent = (typeof events)[number];

/** The name of every event exported from a file under `server/events/`. */
export type EventName = DiscoveredEvent["name"];

/**
 * What listeners of the event named `Name` receive, and what the test
 * harness records for its emits: its payload schema's output.
 */
export type EventPayload<Name extends EventName> = z.output<
  Extract<DiscoveredEvent, DomainEvent<z.ZodType, Name>>["payload"]
>;

/**
 * What {@link DomainEvent.emit} takes for the event named `Name`: its payload
 * schema's input.
 */
export type EventInput<Name extends EventName> = z.input<
  Extract<DiscoveredEvent, DomainEvent<z.ZodType, Name>>["payload"]
>;

function entries(): readonly (Listener | Renamed<Listener>)[] {
  return listeners;
}

function definitions(): readonly Listener[] {
  return definitionsIn(entries());
}

/**
 * Every listener discovered under `server/listeners/`.
 *
 * `nuxvel queue:work` uses it to run the
 * queued ones.
 */
export function allListeners(): readonly Listener[] {
  return definitions();
}

/**
 * The discovered listeners for this event name, in discovery order.
 *
 * {@link DomainEvent.emit} uses it to decide what runs
 * inline and what goes on the queue.
 */
export function listenersFor(event: string): readonly Listener[] {
  return definitions().filter((listener) => listener.event === event);
}

/**
 * The discovered listener with this file-derived name, or with an old
 * name a {@link renamed} alias keeps, or `undefined` when no file
 * defines one.
 *
 * The queue uses it to find the handler
 * behind a queued listener's job.
 */
export function findListener(name: string): Listener | undefined {
  return resolveName(entries(), name);
}

/**
 * Every {@link renamed} alias under `server/listeners/`: an old listener
 * name and the listener it now runs.
 *
 * `nuxvel queue:work` runs a listener still queued under the old name
 * with the listener it points at.
 */
export function listenerAliases(): readonly Renamed<Listener>[] {
  return aliasesIn(entries());
}
