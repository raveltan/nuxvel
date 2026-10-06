import type { z } from "zod";
import type { DomainEvent } from "../../runtime/server/events/define-event";
import type { Listener } from "../../runtime/server/events/define-listener";
import type { EventName, EventPayload } from "../../runtime/server/events/registry";
import type { ListenerRun } from "../../runtime/server/observe/channels";
import { listenerJobName } from "../../runtime/server/events/queue-name";
import { recordedEffects } from "../recorded";
import { expectNotRecorded, expectRecorded, includes } from "./records";

function definitionName(nameOrDefinition: string | { name: string }) {
  return typeof nameOrDefinition === "string" ? nameOrDefinition : nameOrDefinition.name;
}

/**
 * Asserts that the app called {@link DomainEvent.emit} for an event, by its name or
 * its definition, during the test, with a payload whose fields include `match`. Cleared after
 * every test by `@nuxvel/nuxt/testing/setup`.
 *
 * @param name An {@link EventName}, or the event's definition or its stub
 * from `#nuxvel/test-namespaces`; a misspelled event fails to compile.
 * @param match Payload fields typed by the event's parsed payload;
 * defaults to matching any payload.
 * @param options.times How many matching emits there must be, 1 or more.
 * @returns The payload of the latest matching emit.
 *
 * @example
 * ```ts
 * const { postId } = await expectEmitted("post.published", { postId: post.id });
 * await expectEmitted($events.post.published);
 * ```
 */
export async function expectEmitted<Name extends EventName>(
  name: Name,
  match?: Partial<EventPayload<Name>>,
  options?: { times?: number },
): Promise<EventPayload<Name>>;
export async function expectEmitted<Schema extends z.ZodType>(
  event: DomainEvent<Schema>,
  match?: Partial<z.output<Schema>>,
  options?: { times?: number },
): Promise<z.output<Schema>>;
export async function expectEmitted(nameOrEvent: string | DomainEvent, match?: object, options: { times?: number } = {}) {
  const name = definitionName(nameOrEvent);
  const { emitted } = await recordedEffects();
  const matchesPayload = includes(match);

  return expectRecorded(
    "expectEmitted",
    `an "${name}" event with ${JSON.stringify(match ?? {})}`,
    emitted,
    (event) => event.name === name && matchesPayload(event.payload),
    options.times,
  ).payload;
}

/**
 * Asserts that the app did not call {@link DomainEvent.emit} for an event, by its
 * name or its definition, with a payload whose fields include `match`.
 * Without `match`, any emit of that event fails it. The opposite of
 * {@link expectEmitted}.
 *
 * @example
 * ```ts
 * await expectNotEmitted("post.published");
 * await expectNotEmitted($events.post.published, { postId: draft.id });
 * ```
 */
export async function expectNotEmitted<Name extends EventName>(name: Name, match?: Partial<EventPayload<Name>>): Promise<void>;
export async function expectNotEmitted<Schema extends z.ZodType>(
  event: DomainEvent<Schema>,
  match?: Partial<z.output<Schema>>,
): Promise<void>;
export async function expectNotEmitted(nameOrEvent: string | DomainEvent, match?: object) {
  const name = definitionName(nameOrEvent);
  const { emitted } = await recordedEffects();
  const matchesPayload = includes(match);

  expectNotRecorded(
    "expectNotEmitted",
    `an "${name}" event with ${JSON.stringify(match ?? {})}`,
    emitted,
    (event) => event.name === name && matchesPayload(event.payload),
  );
}

/**
 * Asserts that a sync listener, by its name or its definition, ran
 * during the test.
 *
 * A queued listener runs in the `nuxvel queue:work` process, not in the
 * app under test, so this sees sync listeners only. Use
 * {@link expectListenerQueued} for a queued one.
 *
 * @param options.times How many runs there must be, 1 or more.
 * @returns The latest matching run.
 *
 * @example
 * ```ts
 * await expectListenerRan("record-view");
 * await expectListenerRan($listeners.recordView);
 * ```
 */
export async function expectListenerRan(name: string | Listener, options: { times?: number } = {}): Promise<ListenerRun> {
  const listener = definitionName(name);
  const { listenerRuns } = await recordedEffects();

  return expectRecorded("expectListenerRan", `a run of listener "${listener}"`, listenerRuns, (run) => run.name === listener, options.times);
}

/**
 * Asserts that a sync listener, by its name or its definition, did not
 * run during the test. The opposite of {@link expectListenerRan}.
 *
 * @example
 * ```ts
 * await expectNoListenerRan("record-view");
 * ```
 */
export async function expectNoListenerRan(name: string | Listener): Promise<void> {
  const listener = definitionName(name);
  const { listenerRuns } = await recordedEffects();

  expectNotRecorded("expectNoListenerRan", `a run of listener "${listener}"`, listenerRuns, (run) => run.name === listener);
}

/**
 * Asserts that a queued listener, by its name or its definition, reached
 * the queue during the test. Relays the outbox first. Use
 * {@link expectListenerRan} for a sync listener.
 *
 * @param options.times How many queued jobs there must be, 1 or more.
 * @returns The payload that the latest matching job carries.
 *
 * @example
 * ```ts
 * await expectListenerQueued("notify-subscribers");
 * await expectListenerQueued($listeners.notifySubscribers);
 * ```
 */
export async function expectListenerQueued(name: string | Listener, options: { times?: number } = {}): Promise<unknown> {
  const jobName = listenerJobName(definitionName(name));
  const { queued } = await recordedEffects();

  return expectRecorded("expectListenerQueued", `a queued job "${jobName}"`, queued, (job) => job.name === jobName, options.times).payload;
}
