import { addServerHandler } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { TRPC_PATH } from "../runtime/shared/trpc/trpc-path";
import type { ResolvedOptions, RuntimeFile } from "./resolved-options";

export function addHealthRoutes(runtimeFile: RuntimeFile) {
  addServerHandler({
    route: "/api/health/live",
    handler: runtimeFile("./runtime/server/routes/health-live"),
  });

  addServerHandler({
    route: "/api/health/ready",
    handler: runtimeFile("./runtime/server/routes/health-ready"),
  });
}

export function addApiRoutes(nuxt: Nuxt, options: ResolvedOptions, runtimeFile: RuntimeFile) {
  addServerHandler({
    route: `${TRPC_PATH}/**`,
    handler: runtimeFile("./runtime/server/trpc/handler"),
  });

  if (options.api.openapi) {
    addServerHandler({
      route: `${options.api.restPrefix}/openapi.json`,
      method: "get",
      handler: runtimeFile("./runtime/server/routes/openapi-json"),
    });
  }

  if (options.api.openapi && (nuxt.options.dev || options.api.docs)) {
    addServerHandler({
      route: `${options.api.restPrefix}/docs`,
      method: "get",
      handler: runtimeFile("./runtime/server/routes/openapi-docs"),
    });
  }

  addServerHandler({
    route: `${options.api.restPrefix}/**:trpc`,
    handler: runtimeFile("./runtime/server/trpc/rest-handler"),
  });

  const routes: [route: string, method: "get" | "post", handler: string][] = [
    ["/api/flags", "get", "flags"],
    ["/api/flags/exposures", "post", "flag-exposure"],
    ["/api/notifications", "get", "notifications"],
    ["/api/notifications/read", "post", "notifications-read"],
    ["/api/uploads/:name", "post", "upload-url"],
    ["/api/webhooks/:name", "post", "webhook"],
    ["/api/channels", "get", "channels"],
    ["/api/channels/join", "post", "channel-join"],
    ["/api/channels/leave", "post", "channel-leave"],
    ["/api/channels/presence", "post", "channel-presence"],
    ["/api/channels/:name", "get", "channel"],
  ];
  for (const [route, method, handler] of routes) {
    addServerHandler({ route, method, handler: runtimeFile(`./runtime/server/routes/${handler}`) });
  }

  addServerHandler({
    route: "/api/auth/**",
    handler: runtimeFile("./runtime/server/auth/handler"),
  });
}
