import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { tracingChannel } from "node:diagnostics_channel";
import { currentEvent } from "../../utils/current-event";
import { type ObservedRun, RUN_CHANNEL, subscribeObserved } from "../channels";
import { type CollectedEntry, type CollectedSpanInput, addSpan, finishEntry, newEntry } from "./collected-entry";
import { keepRawParams } from "./raw-query-params";
import { redactedParams } from "./redacted-params";
import { noteQuery, warnRepeatedQueries } from "./repeated-queries";
import { errorMessage } from "../../errors/error-message";

const requestEntries = new WeakMap<object, CollectedEntry>();
const ownedRequests = new WeakSet<object>();
const openRequests = new Map<string, CollectedEntry>();
const runEntry = new AsyncLocalStorage<CollectedEntry>();
const runs = tracingChannel<CollectedEntry, ObservedRun>(RUN_CHANNEL);
const SERVER_ENTRY_SPANS = 50;
const SERVER_LOG_LEVELS = new Set(["fatal", "error", "warn"]);

function currentEntry() {
  const run = runEntry.getStore();

  if (run) return run;

  const event = currentEvent();

  return event && requestEntries.get(event.context);
}

function record(span: CollectedSpanInput) {
  const entry = currentEntry();

  if (entry) addSpan(entry, span);
}

export function openRequestEntry(context: object, id: string, label: string) {
  const callerEntry = openRequests.get(id);

  if (callerEntry) {
    requestEntries.set(context, callerEntry);
    return;
  }

  const entry = newEntry(id, "request", label);

  requestEntries.set(context, entry);
  ownedRequests.add(context);
  openRequests.set(id, entry);
}

export function ownRequestEntry(context: object) {
  return ownedRequests.has(context) ? requestEntries.get(context) : undefined;
}

export function closeRequestEntry(context: object, status: number) {
  const entry = ownRequestEntry(context);

  if (entry) {
    warnRepeatedQueries(entry);
    openRequests.delete(entry.id);
  }
  requestEntries.delete(context);
  ownedRequests.delete(context);

  return entry && finishEntry(entry, { status });
}

export function collectEffects(finishRun: (entry: CollectedEntry) => void) {
  const runEntries = new WeakMap<ObservedRun, CollectedEntry>();
  const ignore = () => {};
  const runSubscribers = {
    start: ignore,
    end: ignore,
    asyncStart: ignore,
    error: ignore,
    asyncEnd: (run: ObservedRun & { error?: unknown }) => {
      const entry = runEntries.get(run);

      if (!entry) return;

      warnRepeatedQueries(entry);
      finishRun(finishEntry(entry, "error" in run ? { error: errorMessage(run.error) } : {}));
    },
  };

  let serverEntry: CollectedEntry | undefined;

  const recordOnServer = (span: CollectedSpanInput) => {
    serverEntry ??= newEntry(`server:${randomUUID()}`, "server", "server");
    addSpan(serverEntry, span);
    finishRun(finishEntry(serverEntry, {}));
    if (serverEntry.spans.length >= SERVER_ENTRY_SPANS) serverEntry = undefined;
  };

  runs.start.bindStore(runEntry, (run) => {
    const entry = newEntry(run.id, run.kind, run.label);

    runEntries.set(run, entry);

    return entry;
  });
  runs.subscribe(runSubscribers);

  const unsubscribes = [
    subscribeObserved("db:query", (data) => {
      const entry = currentEntry();

      if (!entry) return;

      noteQuery(entry, data);

      const index = addSpan(entry, { type: "db:query", data: { ...data, params: redactedParams(data.sql, data.params) } });

      if (index !== undefined) keepRawParams(entry, index, data.params);
    }),
    subscribeObserved("trpc:call", (data) => record({ type: "trpc:call", data })),
    subscribeObserved("action:call", (data) => record({ type: "action:call", data })),
    subscribeObserved("policy:decision", (data) => record({ type: "policy:decision", data })),
    subscribeObserved("flag:evaluation", (data) => record({ type: "flag:evaluation", data })),
    subscribeObserved("job:dispatch", (data) => record({ type: "job:dispatch", data })),
    subscribeObserved("event:emit", (data) => record({ type: "event:emit", data })),
    subscribeObserved("listener:run", (data) => record({ type: "listener:run", data })),
    subscribeObserved("mail:send", (data) => record({ type: "mail:send", data })),
    subscribeObserved("notification:send", (data) => record({ type: "notification:send", data })),
    subscribeObserved("realtime:broadcast", (data) => record({ type: "realtime:broadcast", data })),
    subscribeObserved("rate-limit:hit", (data) => record({ type: "rate-limit:hit", data })),
    subscribeObserved("cache:lookup", (data) => record({ type: "cache:lookup", data })),
    subscribeObserved("log", (data) => {
      const entry = currentEntry();

      if (entry) addSpan(entry, { type: "log", data });
      else if (SERVER_LOG_LEVELS.has(data.level)) recordOnServer({ type: "log", data });
    }),
    subscribeObserved("error", (data) => {
      const entry = currentEntry() ?? (data.requestId === undefined ? undefined : openRequests.get(data.requestId));

      if (entry) addSpan(entry, { type: "error", data });
      else recordOnServer({ type: "error", data });
    }),
  ];

  return () => {
    runs.start.unbindStore(runEntry);
    runs.unsubscribe(runSubscribers);
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
