import { TRPCClientError } from "@trpc/client";
import { defineNuxtPlugin, setResponseStatus } from "#app";

const statusByCode: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, UNAUTHORIZED: 401 };

const statusOf = (error: unknown) => (error instanceof TRPCClientError ? statusByCode[error.data?.code] : undefined);

/**
 * Renders the error state of a query that fails with `NOT_FOUND`,
 * `FORBIDDEN` or `UNAUTHORIZED` while the server renders the page, with
 * HTTP 404, 403 or 401, in place of the error page with HTTP 500. When
 * two of these codes occur on one page, the page gets the status of the
 * first. Any other error still shows the error page, unless the query
 * sets `ssrCatchError: true`.
 */
export default defineNuxtPlugin((nuxtApp) => {
  let status: number | undefined;
  let otherError = false;

  nuxtApp.hook("vue:error", (error) => {
    const errorStatus = statusOf(error);
    if (errorStatus) status ??= errorStatus;
    else otherError = true;
  });

  nuxtApp.hook("app:rendered", ({ ssrContext }) => {
    if (!status || otherError || !ssrContext?.payload.error) return;

    ssrContext.payload.error = undefined;
    setResponseStatus(ssrContext.event, status);
  });
});
