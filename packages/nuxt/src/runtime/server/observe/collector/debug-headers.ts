import type { CollectedEntry } from "./collected-entry";

function elapsedMs(entry: CollectedEntry) {
  return performance.timeOrigin + performance.now() - entry.startedAt;
}

function spanCounts(entry: CollectedEntry) {
  const counts = new Map<string, number>();

  for (const span of entry.spans) counts.set(span.type, (counts.get(span.type) ?? 0) + 1);

  return counts;
}

export function debugHeaders(entry: CollectedEntry) {
  const counts = [...spanCounts(entry)].map(
    ([type, count]) => `${type.replaceAll(":", "-")};desc="${count} ${type}"`,
  );

  return {
    "x-nuxvel-debug-id": entry.id,
    "server-timing": [`total;dur=${elapsedMs(entry).toFixed(1)}`, ...counts].join(", "),
  };
}
