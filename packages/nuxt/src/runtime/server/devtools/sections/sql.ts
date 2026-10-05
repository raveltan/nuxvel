import type { CollectedEntry } from "../../observe/collector/collected-entry";
import { recentEntries } from "../../observe/collector/entries-buffer";
import { queryFingerprint } from "../../observe/collector/query-fingerprint";
import { REPEATED_QUERY_THRESHOLD } from "../../database/allow-repeated-queries";
import { defineDevtoolsSection } from "../define-devtools-section";
import type { SqlSectionData } from "../../../shared/devtools/sections/sql";

const ENTRY_LIMIT = 20;

function entryQueries(entry: CollectedEntry) {
  const queries = entry.spans.flatMap((span, index) =>
    span.type === "db:query" ? [{ index, atMs: span.atMs, ...span.data, fingerprint: queryFingerprint(span.data.sql) }] : [],
  );
  const counts = new Map<string, number>();

  for (const { fingerprint, repeatReason } of queries) {
    if (repeatReason === undefined) counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }

  return queries.map(({ fingerprint, ...query }) => {
    const repeated = counts.get(fingerprint) ?? 0;

    return { ...query, repeated, suspected: repeated >= REPEATED_QUERY_THRESHOLD };
  });
}

export default defineDevtoolsSection<SqlSectionData>({
  id: "sql",
  title: "SQL",
  order: 32,
  load: async () =>
    recentEntries()
      .flatMap((entry) => {
        const queries = entryQueries(entry);

        return queries.length === 0
          ? []
          : [{ id: entry.id, kind: entry.kind, label: entry.label, startedAt: entry.startedAt, queries }];
      })
      .slice(0, ENTRY_LIMIT),
});
