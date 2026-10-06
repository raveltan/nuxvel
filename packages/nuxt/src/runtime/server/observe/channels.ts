import { channel, tracingChannel } from "node:diagnostics_channel";
import type { Actor } from "../actions/system-actor";
import type { SerializedError } from "../logging/log-record";
import type { PresenceParams } from "../../shared/realtime/presence-room";
import type { NotificationMessage } from "../notifications/notification-message";

/**
 * One SQL statement the app ran, with its bound parameters and how long
 * it took to settle. Published only by the timing wrapper the dev
 * collector puts on the postgres.js client, so never in production.
 */
export interface ObservedQuery {
  sql: string;
  params: unknown[];
  durationMs: number;
  /** The reason given to `allowRepeatedQueries()`, when it ran inside one. */
  repeatReason?: string;
}

/** One tRPC procedure call, once it answered. */
export interface ObservedProcedureCall {
  path: string;
  type: "query" | "mutation" | "subscription";
  durationMs: number;
  ok: boolean;
  /** The tRPC error code of a failed call. */
  error?: string;
  /** The message of a failed call, `Invalid input` for an input that failed its schema. */
  message?: string;
  /** The messages per input field of a failed call, when the error belongs to specific fields. */
  fields?: Record<string, string[]>;
}

/** One {@link defineAction} call, once it finished. */
export interface ObservedActionCall {
  action: string;
  actor: Actor;
  durationMs: number;
  ok: boolean;
  error?: string;
}

/** One {@link can} answer, which {@link authorize} goes through too. */
export interface ObservedPolicyDecision {
  action: string;
  table: string;
  actor: string;
  allowed: boolean;
}

/** One {@link flag} or {@link experiment} evaluation and what it answered. */
export interface ObservedFlagEvaluation {
  kind: "flag" | "experiment";
  name: string;
  value: boolean | string;
}

/** One queued dispatch: the queue job name and its payload. */
export interface DispatchedCall {
  name: string;
  payload: unknown;
}

/** One {@link DomainEvent.emit} call: the event's name and its parsed payload. */
export interface EmittedEvent {
  name: string;
  payload: unknown;
}

/** One listener run: the listener's file-derived name and its event. */
export interface ListenerRun {
  name: string;
  event: string;
}

/** One {@link Mail.send} call that was not suppressed: the mail's name and its validated input. */
export interface SentMail {
  name: string;
  input: Record<string, unknown>;
}

/** One user a {@link Notification.notify} call reached: the notification's name and its `database` message, if it has one. */
export interface SentNotification {
  userId: string;
  name: string;
  message?: NotificationMessage;
}

/** One {@link Channel.broadcast} that reached Redis. */
export interface ObservedBroadcast {
  channel: string;
  event: string;
  /** The payload after the event's schema parsed it. */
  payload: unknown;
  /** The room's params, such as `{ boardId: 7 }`, when the broadcast went to one room. */
  params?: PresenceParams;
}

/** One attempt counted against a rate limit, allowed or refused. */
export interface ObservedRateLimitHit {
  key: string;
  allowed: boolean;
}

/** One {@link remember} or {@link cacheGet} read, and whether the key was cached. */
export interface ObservedCacheLookup {
  key: string;
  hit: boolean;
}

/** One log line from {@link useLogger}, where the dev server also sends each `console.*` call. */
export interface ObservedLog {
  level: string;
  message: string;
  tag?: string;
  /** The plain-object fields of a {@link useLogger} line. */
  fields?: Record<string, unknown>;
  /** The `Error` of a {@link useLogger} line, with its cause chain up to 5 levels deep. */
  err?: SerializedError;
}

/**
 * One error handed to error tracking, with its cause chain and the ID
 * of the request it failed, when it failed one.
 */
export interface ObservedError {
  name: string;
  message: string;
  stack?: string;
  /**
   * The `cause` of the error, with its own `cause`, up to 5 levels deep.
   * A cause that is not an `Error` is its text.
   */
  cause?: Omit<ObservedError, "requestId" | "hint"> | string;
  /**
   * In development only: what to do when the database and the schema
   * differ, such as a missing table or column.
   */
  hint?: string;
  requestId?: string;
}

/**
 * Every effect nuxvel publishes on a `node:diagnostics_channel` channel,
 * keyed by the channel's name after its `nuxvel:` prefix. Publishing
 * costs nothing while no one subscribes; the dev collector and the test
 * recorders subscribe with {@link subscribeObserved}.
 */
export interface ObservedEffects {
  /** A statement the app ran, once it settled. */
  "db:query": ObservedQuery;
  /** A tRPC procedure call, once it answered. */
  "trpc:call": ObservedProcedureCall;
  /** A `defineAction()` call, once it finished. */
  "action:call": ObservedActionCall;
  /** A `can()` / `authorize()` decision. */
  "policy:decision": ObservedPolicyDecision;
  /** A `flag()` or `experiment()` evaluation. */
  "flag:evaluation": ObservedFlagEvaluation;
  /** A job `dispatch()`, or a queued listener dispatch, once its transaction committed. */
  "job:dispatch": DispatchedCall;
  /** An `emit()` whose payload passed its schema. */
  "event:emit": EmittedEvent;
  /** A sync listener run. */
  "listener:run": ListenerRun;
  /** A mail `send()` that was not suppressed, once its transaction committed. */
  "mail:send": SentMail;
  /** One user a `notify()` reached, once its transaction committed. */
  "notification:send": SentNotification;
  /** A `broadcast()` that reached Redis. */
  "realtime:broadcast": ObservedBroadcast;
  /** An attempt counted against a rate limit. */
  "rate-limit:hit": ObservedRateLimitHit;
  /** A `remember()` or `cacheGet()` read, hit or miss. */
  "cache:lookup": ObservedCacheLookup;
  /** A consola line, while the dev collector runs. */
  log: ObservedLog;
  /** An error handed to error tracking. */
  error: ObservedError;
}

/** The name of an {@link ObservedEffects} channel, without its `nuxvel:` prefix. */
export type ObservedName = keyof ObservedEffects;

/**
 * One unit of work outside a request that the dev collector keeps as an
 * entry of its own: a queued job run, a `task:run`, or one `tinker`
 * evaluation.
 */
export interface ObservedRun {
  id: string;
  kind: "job" | "command";
  label: string;
}

/** The `node:diagnostics_channel` tracing channel {@link observeRun} traces on. */
export const RUN_CHANNEL = "nuxvel:run";

const runs = tracingChannel<unknown, ObservedRun>(RUN_CHANNEL);

function observedChannel(name: ObservedName) {
  return channel(`nuxvel:${name}`);
}

/** Whether anything subscribes to this effect, for a call site that must build its message first. */
export function isObserved(name: ObservedName) {
  return observedChannel(name).hasSubscribers;
}

/** Publishes one effect, doing nothing while no one subscribes. */
export function publishObserved<Name extends ObservedName>(name: Name, message: ObservedEffects[Name]) {
  const target = observedChannel(name);

  if (target.hasSubscribers) target.publish(message);
}

/** Subscribes to one effect, returning the unsubscribe. */
export function subscribeObserved<Name extends ObservedName>(
  name: Name,
  onMessage: (message: ObservedEffects[Name]) => void,
) {
  // diagnostics_channel types every message unknown; publishObserved is the only publisher on these names
  const listener = (message: unknown) => onMessage(message as ObservedEffects[Name]);

  observedChannel(name).subscribe(listener);

  return () => observedChannel(name).unsubscribe(listener);
}

/**
 * Runs `fn` as one {@link ObservedRun} traced on {@link RUN_CHANNEL}, so
 * every effect it publishes lands in that run's entry. Calls `fn`
 * straight through while no one subscribes.
 */
export function observeRun<Result>(run: ObservedRun, fn: () => Promise<Result>): Promise<Result> {
  return runs.tracePromise(fn, run);
}
