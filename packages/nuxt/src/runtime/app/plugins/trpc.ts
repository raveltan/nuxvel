import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { defineNuxtPlugin, useRequestEvent, useRuntimeConfig } from "#app";
import { createTrpcClientLink } from "../../shared/trpc/client-link";
import type { AppTRPC } from "../trpc/app-trpc";
import { createTrpcOptionsProxy } from "../trpc/options-proxy";
import type { AppRouter } from "../../server/trpc/router";
import { trpcEndpoint } from "../../shared/trpc/trpc-path";
import { CLIENT_OUTDATED } from "../../shared/trpc/build-id-header";
import { reportBrowserProblem } from "../devtools/report-browser-problem";
import { isNetworkError } from "../trpc/is-network-error";

function liveBuildId(error: unknown) {
  return error instanceof TRPCClientError && error.data?.code === CLIENT_OUTDATED ? String(error.data.buildId) : undefined;
}

/**
 * Provides `$trpc`, the typed tRPC client with the Pinia Colada option
 * factories layered on. During SSR it calls procedures in-process with
 * the visitor's request headers — cookie included, so `authedProcedure`
 * queries render signed in. Every call carries the app's build ID; once
 * the server answers `CLIENT_OUTDATED`, the plugin calls Nuxt's
 * `app:manifest:update` hook, so the next navigation reloads the page, as
 * after Nuxt's own outdated-build check. Every call also carries the
 * locale of the current page for {@link currentLocale}. Read it
 * through the auto-imported `$api`. Named `nuxvel:trpc`, so an app
 * plugin can `dependsOn` it.
 */
export default defineNuxtPlugin({
  name: "nuxvel:trpc",
  setup(nuxtApp): { provide: { trpc: AppTRPC } } {
    const watchOutdated: TRPCLink<AppRouter> = () => ({ next, op }) =>
      observable((observer) =>
        next(op).subscribe({
          next: (value) => observer.next(value),
          error: (error) => {
            const id = liveBuildId(error);
            if (id) void nuxtApp.hooks.callHook("app:manifest:update", { id, timestamp: Date.now() });
            if (import.meta.dev && import.meta.client) {
              const code = error.data?.code ?? "UNKNOWN";
              reportBrowserProblem(isNetworkError(error) ? "error" : "warn", error, `tRPC ${op.type} ${op.path} failed (${code}): ${error.message}`);
            }
            observer.error(error);
          },
          complete: () => observer.complete(),
        }),
      );

    const { app } = useRuntimeConfig();
    const client = createTRPCClient<AppRouter>({
      links: [watchOutdated, createTrpcClientLink<AppRouter>(trpcEndpoint(app.baseURL), useRequestEvent()?.fetch, app.buildId, () => nuxtApp.$getLocale?.())],
    });

    return {
      provide: {
        trpc: createTrpcOptionsProxy<AppRouter, typeof client>(client),
      },
    };
  },
});
