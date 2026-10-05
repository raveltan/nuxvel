import { defineEventHandler, getRequestHeader, readBody } from "h3";
import { useEvent } from "nitropack/runtime";
import { createOpenApiNuxtHandler } from "trpc-to-openapi";
import { createContext } from "./request/create-context";
import { reportUnexpectedError } from "./report-unexpected-error";
import { retryAfterHeader } from "./retry-after-header";
import { appRouter } from "./router";

const openApiHandler = createOpenApiNuxtHandler({
  router: appRouter,
  createContext: () => createContext(useEvent()),
  onError: reportUnexpectedError,
  responseMeta: retryAfterHeader,
});

export default defineEventHandler(async (event) => {
  // trpc-to-openapi parses the request stream itself, which nuxt-security's XSS validator has already read
  if (getRequestHeader(event, "content-type") === "application/json") {
    const body = await readBody(event).catch(() => undefined);
    if (body !== undefined) Object.assign(event.node.req, { body });
  }

  return openApiHandler(event);
});
