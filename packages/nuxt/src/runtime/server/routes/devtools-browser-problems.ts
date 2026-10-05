import { randomUUID } from "node:crypto";
import { createError, defineEventHandler, getRequestHeader, readValidatedBody, setResponseStatus } from "h3";
import { browserProblem } from "../../shared/devtools/browser-problem";
import { useLogger } from "../logging/logger";
import { addSpan, finishEntry, newEntry } from "../observe/collector/collected-entry";
import { collectedEntry, storeEntry } from "../observe/collector/entries-buffer";

const MAX_BODY_BYTES = 32 * 1024;

export default defineEventHandler(async (event) => {
  if (!getRequestHeader(event, "content-type")?.startsWith("application/json")) {
    throw createError({ statusCode: 415, statusMessage: "Send the browser problem as JSON" });
  }
  if (Number(getRequestHeader(event, "content-length") ?? 0) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "The browser problem is larger than 32 KB" });
  }

  const { level, message, path, requestId } = await readValidatedBody(event, browserProblem.parse);

  useLogger("browser")[level](message, { path, ...(requestId === undefined ? {} : { requestId }) });

  const browserEntryId = requestId === undefined ? randomUUID() : `browser:${requestId}`;
  const pageEntry = requestId === undefined ? undefined : (collectedEntry(requestId) ?? collectedEntry(browserEntryId));
  const entry = pageEntry ?? newEntry(browserEntryId, "request", `BROWSER ${path}`);

  addSpan(entry, { type: "log", data: { level, message, tag: "browser" } });
  storeEntry(pageEntry ?? finishEntry(entry, {}));

  setResponseStatus(event, 204);
  return null;
});
