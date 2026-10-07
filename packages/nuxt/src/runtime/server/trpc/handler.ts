import { defineLazyEventHandler } from "h3";
import { useRuntimeConfig } from "nitropack/runtime";
import { createTRPCNuxtHandler } from "trpc-nuxt/server";
import { createContext } from "./request/create-context";
import { reportUnexpectedError } from "./report-unexpected-error";
import { invalidatesHeader } from "./invalidates-header";
import { retryAfterHeader } from "./retry-after-header";
import { appRouter } from "./router";
import { TRPC_MAX_BATCH_SIZE } from "../../shared/trpc/max-batch-size";
import { trpcEndpoint } from "../../shared/trpc/trpc-path";

export default defineLazyEventHandler(() =>
  createTRPCNuxtHandler({
    router: appRouter(),
    endpoint: trpcEndpoint(useRuntimeConfig().app.baseURL),
    createContext,
    maxBatchSize: TRPC_MAX_BATCH_SIZE,
    onError: reportUnexpectedError,
    responseMeta: (meta) => ({ headers: { ...retryAfterHeader(meta).headers, ...invalidatesHeader() } }),
  }),
);
