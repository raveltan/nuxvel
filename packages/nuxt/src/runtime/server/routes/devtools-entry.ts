import { createError, defineEventHandler, getRouterParam } from "h3";
import type { TimelineEntry } from "../../shared/devtools/collected-entry";
import { collectedEntry } from "../observe/collector/entries-buffer";
import { spanSummary } from "../devtools/span-summary";

export default defineEventHandler((event): TimelineEntry => {
  const entry = collectedEntry(getRouterParam(event, "id", { decode: true }) ?? "");

  if (!entry) throw createError({ statusCode: 404, statusMessage: "No collected entry with this id" });

  return { ...entry, spans: entry.spans.map((span) => ({ ...span, summary: spanSummary(span) })) };
});
