import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { REPEATED_QUERY_THRESHOLD } from "../../database/allow-repeated-queries";
import { queryCallSite } from "../../database/connection/query-call-site";
import { useLogger } from "../../logging/logger";
import type { ObservedQuery } from "../channels";
import type { CollectedEntry } from "./collected-entry";
import { queryFingerprint } from "./query-fingerprint";

interface RepeatedQuery {
  sql: string;
  count: number;
  at?: string;
}

const FRAME_LOCATION = /(?:\(|^at )((?:file:\/\/)?\/[^()]+?):(\d+):\d+\)?$/;
const NOT_APP_CODE = /\/node_modules\/|\/packages\/nuxt\/|\/\.nuxt\/|\/\.output\//;

const tallies = new WeakMap<CollectedEntry, Map<string, RepeatedQuery>>();

function appFrame(stack: string | undefined) {
  for (const line of stack?.split("\n").slice(1) ?? []) {
    const [, location, lineNumber] = line.trim().match(FRAME_LOCATION) ?? [];

    if (!location || NOT_APP_CODE.test(location)) continue;

    const path = location.startsWith("file://") ? fileURLToPath(location) : location;

    if (isAbsolute(path)) return `${relative(process.cwd(), path)}:${lineNumber}`;
  }

  return undefined;
}

function warning(label: string, { sql, count, at }: RepeatedQuery) {
  return [
    `N+1 suspected in ${label} (${count} × the same query)`,
    `  ${sql}`,
    ...(at ? [`  at ${at}`] : []),
    "  Load the rows in one query (a `with:` relation or `inArray`), or wrap it in allowRepeatedQueries(reason, fn)",
  ].join("\n");
}

export function noteQuery(entry: CollectedEntry, query: ObservedQuery) {
  if (query.repeatReason !== undefined) return;

  const tally = tallies.get(entry) ?? new Map<string, RepeatedQuery>();
  const fingerprint = queryFingerprint(query.sql);
  const repeated = tally.get(fingerprint) ?? { sql: query.sql, count: 0 };

  repeated.count += 1;
  if (repeated.count === 2) repeated.at = appFrame(queryCallSite());
  tally.set(fingerprint, repeated);
  tallies.set(entry, tally);
}

export function warnRepeatedQueries(entry: CollectedEntry) {
  for (const repeated of tallies.get(entry)?.values() ?? []) {
    if (repeated.count >= REPEATED_QUERY_THRESHOLD) useLogger("db").warn(warning(entry.label, repeated));
  }

  tallies.delete(entry);
}
