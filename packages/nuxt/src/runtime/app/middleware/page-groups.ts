import { defineNuxtRouteMiddleware, useNuxtApp } from "#app";
import type { RouteMiddleware } from "#app";
import { namedMiddleware } from "#build/middleware";

type MiddlewareImports = Record<string, (() => Promise<{ default?: RouteMiddleware } | RouteMiddleware>) | undefined>;

export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp = useNuxtApp();
  // #build/middleware imports this file, so its exports are read when the middleware runs, not when the module loads
  const named: MiddlewareImports = namedMiddleware;
  const names = [to.meta.groupMiddleware].flat().filter((name): name is string => typeof name === "string");

  for (const name of names) {
    const loaded = await named[name]?.();
    const middleware = loaded && "default" in loaded ? loaded.default : loaded;
    if (!middleware) throw new Error(`nuxvel: the route group middleware "${name}" does not exist`);
    const result = await nuxtApp.runWithContext(() => middleware(to, from));
    if (result !== undefined && result !== true) return result;
  }
});
