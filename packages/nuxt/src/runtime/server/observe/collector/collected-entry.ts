import type { ObservedEffects, ObservedName } from "../channels";
import { sanitizedWithin } from "./sanitized";

const MAX_SPANS = 1000;
const MAX_SPAN_BYTES = 16 * 1024;

/** One observed effect, as a {@link CollectedEntry} keeps it. */
export type CollectedSpanInput = {
  [Name in ObservedName]: { type: Name; data: ObservedEffects[Name] };
}[ObservedName];

/**
 * One effect inside a {@link CollectedEntry}: its channel name, its
 * message with secret-looking keys (and a query's params bound to
 * secret-looking columns) redacted and long values cut, and
 * when it happened, in milliseconds since the entry started. A message
 * whose copy would pass 16 KB of JSON keeps its first 16 KB and is
 * marked `truncated`.
 */
export type CollectedSpan = CollectedSpanInput & { atMs: number; truncated?: true };

/**
 * Everything the dev collector saw during one request, queued job run
 * or command (`task:run`, one `tinker` evaluation): the effects it
 * published, in order. `id` is the request id, `job:<BullMQ id>` or
 * `command:<uuid>`. A `server` entry (`server:<uuid>`) keeps the
 * warnings, errors and failures that happened outside all of these, at
 * most 50 per entry. `durationMs` is set once it finished, with `status`
 * for a request and `error` for a run that threw; `truncated` says
 * spans past the cap were dropped. Plain JSON, so it can cross a
 * process boundary as is.
 */
export interface CollectedEntry {
  id: string;
  kind: "request" | "job" | "command" | "server";
  label: string;
  startedAt: number;
  durationMs?: number;
  status?: number;
  error?: string;
  actor?: string;
  spans: CollectedSpan[];
  truncated: boolean;
}

function now() {
  return performance.timeOrigin + performance.now();
}

export function newEntry(id: string, kind: CollectedEntry["kind"], label: string): CollectedEntry {
  return { id, kind, label, startedAt: now(), spans: [], truncated: false };
}

export function addSpan(entry: CollectedEntry, span: CollectedSpanInput) {
  if (entry.spans.length >= MAX_SPANS) {
    entry.truncated = true;
    return;
  }

  if (span.type === "action:call" && !entry.actor) entry.actor = `${span.data.actor.type}:${span.data.actor.id}`;

  const { value, cut } = sanitizedWithin(span, MAX_SPAN_BYTES);

  return entry.spans.push({ ...value, atMs: now() - entry.startedAt, ...(cut && { truncated: true }) }) - 1;
}

export function finishEntry(entry: CollectedEntry, outcome: { status?: number; error?: string }) {
  entry.durationMs = now() - entry.startedAt;
  if (outcome.status !== undefined) entry.status = outcome.status;
  if (outcome.error !== undefined) entry.error = outcome.error;

  return entry;
}
