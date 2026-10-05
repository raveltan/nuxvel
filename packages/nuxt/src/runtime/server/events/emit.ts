import type { z } from "zod";
import events from "#nuxvel/events";
import { queueAfterCommit } from "../jobs/outbox/queue-after-commit";
import { publishObserved } from "../observe/channels";
import type { DomainEvent } from "./define-event";
import { listenerJobName } from "./queue-name";
import { type EventInput, type EventName, listenersFor } from "./registry";

function eventNamed(name: string): DomainEvent {
  const discovered: readonly DomainEvent[] = events;
  const found = discovered.find((event) => event.name === name);

  if (!found) throw new Error(`No event is named "${name}"`);

  return found;
}

/**
 * Emits a domain event, running every listener defined for it.
 *
 * Auto-imported on the server. Call it from the action that made the
 * thing happen, with the event's {@link EventName} or its
 * {@link defineEvent} object, and the event schema's input type. An
 * unknown name fails to compile. The payload is
 * validated against the schema first, so a wrong payload throws a
 * {@link ValidationFailedError} at the emit. Every listener parses the
 * payload as emitted, so a schema that transforms runs once per
 * listener, from the raw value.
 *
 * A `sync: true` listener runs inline, awaited, inside the emitting
 * action's transaction: its writes commit or roll back with the action's,
 * and a throw fails the action. Every other listener is enqueued once
 * that transaction commits and runs in `nuxvel queue:work`, so nothing
 * fires for a rolled-back emit.
 *
 * @example
 * ```ts
 * await emit("post.published", { postId: post.id });
 * await emit(postPublishedEvent, { postId: post.id });
 * ```
 */
export async function emit<Name extends EventName>(name: Name, payload: EventInput<Name>): Promise<void>;
export async function emit<Schema extends z.ZodType>(
  event: DomainEvent<Schema>,
  payload: z.input<Schema>,
): Promise<void>;
export async function emit(nameOrEvent: string | DomainEvent, payload: unknown): Promise<void> {
  const event = typeof nameOrEvent === "string" ? eventNamed(nameOrEvent) : nameOrEvent;
  const parsed = await event.parse(payload);

  publishObserved("event:emit", { name: event.name, payload: parsed });

  for (const listener of listenersFor(event.name)) {
    if (!listener.sync) {
      await queueAfterCommit(listenerJobName(listener.name), listener.version, payload);
      continue;
    }

    await listener.run(payload);
    publishObserved("listener:run", { name: listener.name, event: event.name });
  }
}
