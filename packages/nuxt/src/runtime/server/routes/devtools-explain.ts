import { createError, defineEventHandler, getRequestHeader, readValidatedBody } from "h3";
import { z } from "zod";
import { explainQuery, isBindable } from "../devtools/explain-query";
import { collectedEntry } from "../observe/collector/entries-buffer";
import { rawQueryParams } from "../observe/collector/raw-query-params";

const explainRequest = z.object({ entryId: z.string(), index: z.number().int().nonnegative() });

export default defineEventHandler(async (event) => {
  if (!getRequestHeader(event, "content-type")?.startsWith("application/json")) {
    throw createError({ statusCode: 415, statusMessage: "Send the entry id and query index as JSON" });
  }

  const { entryId, index } = await readValidatedBody(event, explainRequest.parse);
  const entry = collectedEntry(entryId);
  const span = entry?.spans[index];
  const params = entry && rawQueryParams(entry, index);

  if (span?.type !== "db:query" || !params?.every(isBindable)) {
    throw createError({ statusCode: 404, statusMessage: "No such query among this server's collected entries" });
  }

  return { plan: await explainQuery(span.data.sql, params) };
});
