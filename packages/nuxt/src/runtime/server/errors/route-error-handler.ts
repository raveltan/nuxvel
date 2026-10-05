import errorHandlers from "#nuxvel/error-handlers";
import { type H3Error, type H3Event, send, setResponseHeaders, setResponseStatus } from "h3";
import { defineNitroErrorHandler, useNitroApp } from "nitropack/runtime";
import type { NitroErrorHandler } from "nitropack/types";
import { getContext } from "unctx";
import { useLogger } from "../logging/logger";
import { answerAsTaxonomyError } from "./route-error";

type DefaultHandler = Parameters<NitroErrorHandler>[2]["defaultHandler"];

async function answer(error: H3Error, event: H3Event, defaultHandler: DefaultHandler) {
  const silentDefaultHandler: DefaultHandler = (handled, handledEvent, options) =>
    defaultHandler(handled, handledEvent, { ...options, silent: true });

  for (const handler of errorHandlers) {
    try {
      await handler(error, event, { defaultHandler: silentDefaultHandler });
    } catch (handlerError) {
      useLogger("request").error("an error handler failed", handlerError);
    }
    if (event.handled) return;
  }

  const response = await silentDefaultHandler(error, event);

  if (typeof response.body !== "string") delete response.body.stack;

  if (!event.node.res.headersSent) setResponseHeaders(event, response.headers);
  setResponseStatus(event, response.status, response.statusText);

  await send(event, typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2));
}

function passRequestIdToErrorPage(event: H3Event) {
  const requestId = event.context.nuxvelRequestId;

  // Nuxt's error handler renders /__nuxt_error with a copy of the request's headers, not through event.fetch
  if (requestId !== undefined) event.node.req.headers["x-request-id"] = requestId;
}

async function handleError(error: H3Error, event: H3Event, defaultHandler: DefaultHandler) {
  const { hooks } = useNitroApp();
  const response = { body: error };
  const captureHookError = (hookError: Error) => event.captureError(hookError, { tags: ["request", "response"] });

  answerAsTaxonomyError(error, event);
  passRequestIdToErrorPage(event);

  // h3 runs onBeforeResponse / onAfterResponse on the error path only when no error handler answered, and this one always does
  if (!event._onBeforeResponseCalled) {
    event._onBeforeResponseCalled = true;
    await hooks.callHook("beforeResponse", event, response).catch(captureHookError);
  }

  try {
    await answer(error, event, defaultHandler);
  } finally {
    if (!event._onAfterResponseCalled) {
      event._onAfterResponseCalled = true;
      await hooks.callHook("afterResponse", event, response).catch(captureHookError);
    }
  }
}

export default defineNitroErrorHandler((error, event, { defaultHandler }) =>
  // h3 calls the error handler from outside nitro's request context, where useEvent() throws
  getContext<{ event: H3Event }>("nitro-app").callAsync({ event }, () => handleError(error, event, defaultHandler)),
);
