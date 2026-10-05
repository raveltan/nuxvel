import type { H3Event } from "h3";
import { useLogger } from "../logging/logger";
import { queryFingerprint } from "../observe/collector/query-fingerprint";
import { loggedPath } from "../observe/logged-path";
import { REPEATED_QUERY_THRESHOLD, repeatedQueriesReason } from "./allow-repeated-queries";
import { currentEvent } from "../utils/current-event";

const LOG_INTERVAL_MS = 60 * 60 * 1000;
const MAX_REMEMBERED = 1000;

const counts = new WeakMap<H3Event, Map<string, number>>();
const loggedAt = new Map<string, number>();

export function countRepeatedQuery(sql: string) {
  const event = currentEvent();

  if (!event || repeatedQueriesReason() !== undefined) return;

  const byFingerprint = counts.get(event) ?? new Map<string, number>();
  const fingerprint = queryFingerprint(sql);

  byFingerprint.set(fingerprint, (byFingerprint.get(fingerprint) ?? 0) + 1);
  counts.set(event, byFingerprint);
}

export function logRepeatedQueries(event: H3Event) {
  const route = `${event.method} ${loggedPath(event.path)}`;

  for (const [fingerprint, count] of counts.get(event) ?? []) {
    const key = `${route} ${fingerprint}`;

    if (count < REPEATED_QUERY_THRESHOLD || Date.now() - (loggedAt.get(key) ?? 0) < LOG_INTERVAL_MS) continue;

    if (loggedAt.size >= MAX_REMEMBERED) loggedAt.clear();
    loggedAt.set(key, Date.now());
    useLogger("db").warn(`n_plus_one_suspected in ${route} (${count} × the same query)`, { route, fingerprint, count });
  }

  counts.delete(event);
}
