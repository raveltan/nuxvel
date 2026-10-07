import type { z } from "zod";
import { awaitingName } from "../discovery/definition-name";
import { ValidationFailedError } from "../errors/taxonomy";
import { type Upcaster, fromJobPayload, upcastPayload } from "../jobs/payload";

/**
 * An event definition: its name, payload version and the shape emitters
 * must match. The name is its file's path under `server/events/`.
 */
export interface DomainEvent<Schema extends z.ZodType = z.ZodType, Name extends string = string> {
  kind: "event";
  readonly name: Name;
  version: number;
  upcasters: number[];
  payload: Schema;
  parse: (payload: unknown) => Promise<z.output<Schema>>;
  parseQueued: (data: unknown) => Promise<z.output<Schema>>;
  /**
   * Emits this event with `payload`, running every listener defined for
   * it.
   *
   * The payload is validated against the event's schema first, so a
   * wrong payload throws a `ValidationFailedError` at the emit. A
   * `sync: true` listener runs now, inside the surrounding transaction:
   * its writes commit or roll back with it, and a throw fails it. Every
   * other listener is queued once the transaction commits, so nothing
   * runs for a rolled-back emit. Outside a transaction they are queued
   * now.
   *
   * @example
   * ```ts
   * await $events.post.published.emit({ postId: post.id });
   * ```
   */
  emit(payload: z.input<Schema>): Promise<void>;
}

/** Turns a payload written under one version into the next version's shape. */
export type EventUpcaster = Upcaster;

/**
 * Defines a domain event: something that happened, named once and
 * emitted from an action with {@link DomainEvent.emit}.
 *
 * `defineEvent` is auto-imported. One event per file, under
 * `server/events/`, as a named export; the file is discovered, and you
 * reach it through the `$events` namespace where you emit it
 * (`$events.post.published.emit(payload)`) and where you listen for it
 * with {@link defineListener}. The file's path is the event's name
 * (`server/events/post/published.event.ts` is `"post.published"`): what
 * `nuxvel event:list` prints, and part of {@link EventName}.
 *
 * `parse` validates a payload against the schema (async refinements and
 * transforms included), rejecting with the same
 * {@link ValidationFailedError} an action throws. {@link DomainEvent.emit} calls it,
 * so an emitter with the wrong payload fails at the emit, not inside a
 * listener.
 *
 * A queued listener's payload waits in the outbox and on the queue, so it
 * can outlive the shape it was written under — version the event the way
 * {@link defineJob} versions a job, and `parseQueued` carries an older
 * payload up through the upcasters before validating it.
 *
 * @param config.version The version `payload` describes, defaulting to 1.
 * Raise it whenever you change the shape, and add the upcaster that
 * carries the payloads already queued over.
 * @param config.upcasters Keyed by the version a payload was written
 * under; each one returns that payload in the next version's shape.
 * @param config.payload Zod schema for the current version; every emit
 * is checked against it.
 *
 * @example
 * ```ts
 * // server/events/post/published.event.ts
 * export const postPublishedEvent = defineEvent({
 *   version: 2,
 *   upcasters: { 1: (old) => ({ postId: (old as { id: number }).id }) },
 *   payload: z.object({ postId: z.number() }),
 * });
 * ```
 */
export function defineEvent<Schema extends z.ZodType>(config: {
  version?: number;
  upcasters?: Record<number, EventUpcaster>;
  payload: Schema;
}): DomainEvent<Schema> {
  const version = config.version ?? 1;

  const parse = async (payload: unknown) => {
    const result = await config.payload.safeParseAsync(payload);

    if (!result.success) throw new ValidationFailedError(result.error);

    return result.data;
  };

  const event: DomainEvent<Schema> = awaitingName(
    {
      kind: "event",
      name: "",
      version,
      upcasters: Object.keys(config.upcasters ?? {}).map(Number),
      payload: config.payload,
      parse,
      async parseQueued(data: unknown) {
        return parse(
          upcastPayload(
            fromJobPayload(data),
            version,
            config.upcasters ?? {},
            `Event "${event.name}"`,
          ),
        );
      },
      async emit(payload: z.input<Schema>) {
        // a static import cycles through the #nuxvel/events and #nuxvel/listeners registries, which hold this event
        const { emit } = await import("./emit");

        await emit(event, payload);
      },
    },
    "event",
  );

  return event;
}
