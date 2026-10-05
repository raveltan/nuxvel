import type { EventName } from "../runtime/server/events/registry";
import type { z } from "zod";
import type events from "#nuxvel/events";
import type { DomainEvent } from "../runtime/server/events/define-event";
import { callApp } from "./settled";

type EventInput<Name extends EventName> = z.input<
  Extract<(typeof events)[number], DomainEvent<z.ZodType, Name>>["payload"]
>;

/**
 * Emits a {@link defineEvent} event, by its name or its definition, in
 * the app under test, inside a transaction, as an action's {@link emit}
 * would.
 *
 * Sync listeners run before it resolves — assert on them with
 * {@link expectListenerRan} — and queued ones are relayed to the
 * queue fake once the transaction commits. The payload is parsed by the
 * event's schema, rejecting with a `BAD_REQUEST` validation error.
 *
 * @param name An {@link EventName}, or the event's definition or its
 * stub from `#nuxvel/test-namespaces`; a name no event defines fails to
 * compile.
 * @param payload The event's payload, before its schema parses it.
 *
 * @example
 * ```ts
 * import { $events } from "#nuxvel/test-namespaces";
 *
 * await emit($events.post.published, { postId: post.id });
 * await expectListenerRan("notify-subscribers");
 * ```
 */
export async function emit<Name extends EventName>(name: Name, payload: EventInput<Name>): Promise<void>;
export async function emit<Schema extends z.ZodType>(event: DomainEvent<Schema>, payload: z.input<Schema>): Promise<void>;
export async function emit(nameOrEvent: string | DomainEvent, payload: unknown): Promise<void> {
  const name = typeof nameOrEvent === "string" ? nameOrEvent : nameOrEvent.name;

  await callApp("emit", { name, payload });
}
