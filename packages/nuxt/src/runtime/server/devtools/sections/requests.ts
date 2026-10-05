import type { CollectedEntry } from "../../observe/collector/collected-entry";
import { recentEntries } from "../../observe/collector/entries-buffer";
import { defineDevtoolsSection } from "../define-devtools-section";
import type { RequestsSectionData } from "../../../shared/devtools/sections/requests";

function logLevel({ data }: CollectedEntry["spans"][number]) {
  return (data as { level?: string } | undefined)?.level;
}

function entrySummary({ spans, ...entry }: CollectedEntry) {
  const warnings = spans.filter((span) => span.type === "log" && logLevel(span) === "warn").length;
  const errors = spans.filter((span) => span.type === "error" || (span.type === "log" && ["error", "fatal"].includes(logLevel(span) ?? ""))).length;

  return { ...entry, spanCount: spans.length, warnings, errors };
}

export default defineDevtoolsSection<RequestsSectionData>({
  id: "requests",
  title: "Requests",
  order: 5,
  load: async () => recentEntries().map(entrySummary),
});
