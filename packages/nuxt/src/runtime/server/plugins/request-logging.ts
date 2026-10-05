import { randomUUID } from "node:crypto";
import { type H3Event, getRequestHeader, getResponseStatus } from "h3";
import { defineNitroPlugin } from "nitropack/runtime";
import type { NitroFetchOptions, NitroFetchRequest } from "nitropack/types";
import { logRepeatedQueries } from "../database/repeated-queries-log";
import { useLogger } from "../logging/logger";
import { loggedPath } from "../observe/logged-path";

const VALID_REQUEST_ID = /^[\w.:/+=-]{1,128}$/;

function incomingRequestId(header: string | undefined) {
  return header && VALID_REQUEST_ID.test(header) ? header : undefined;
}

function withRequestId(headers: RequestInit["headers"], requestId: string) {
  const merged = new Headers(headers);

  if (!merged.has("x-request-id")) merged.set("x-request-id", requestId);

  return Object.fromEntries(merged);
}

function passRequestIdToNestedFetches(event: H3Event, requestId: string) {
  const { fetch, $fetch } = event;

  const $fetchWithRequestId = (request: NitroFetchRequest, options?: NitroFetchOptions<NitroFetchRequest>) =>
    $fetch<unknown, NitroFetchRequest>(request, { ...options, headers: withRequestId(options?.headers, requestId) });

  event.fetch = (request, init) => fetch(request, { ...init, headers: withRequestId(init?.headers, requestId) });
  // TS2321: comparing a wrapper against nitro's route-typed $fetch signature exceeds the checker's stack depth
  event.$fetch = $fetchWithRequestId as unknown as typeof $fetch;
}

export default defineNitroPlugin((nitro) => {
  const log = useLogger("request");

  nitro.hooks.hook("request", (event) => {
    event.context.nuxvelRequestStartedAt = performance.now();
    const requestId = incomingRequestId(getRequestHeader(event, "x-request-id")) ?? randomUUID();

    event.context.nuxvelRequestId = requestId;
    passRequestIdToNestedFetches(event, requestId);
  });

  nitro.hooks.hook("afterResponse", (event) => {
    const startedAt = event.context.nuxvelRequestStartedAt ?? performance.now();
    const entry = {
      method: event.method,
      path: loggedPath(event.path),
      status: getResponseStatus(event),
      durationMs: performance.now() - startedAt,
      requestId: event.context.nuxvelRequestId,
      actor: event.context.nuxvelActor,
    };

    log.info(`${entry.method} ${entry.path} ${entry.status} (${Math.round(entry.durationMs)}ms)`, entry);
    if (!import.meta.dev) logRepeatedQueries(event);
  });
});
