import { addServerPlugin } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import type { ResolvedOptions, RuntimeFile } from "./resolved-options";

const DEVTOOLS_ENV = "NUXVEL_DEVTOOLS";

export function addServerPlugins(nuxt: Nuxt, options: ResolvedOptions, runtimeFile: RuntimeFile) {
  addServerPlugin(runtimeFile("./runtime/server/plugins/wrap-console"));
  addServerPlugin(runtimeFile("./runtime/server/plugins/validate-env"));
  addServerPlugin(runtimeFile("./runtime/server/plugins/load-registries"));
  addServerPlugin(runtimeFile("./runtime/server/plugins/request-logging"));
  addServerPlugin(runtimeFile("./runtime/server/plugins/signed-in-no-store"));
  addServerPlugin(runtimeFile("./runtime/server/plugins/error-no-store"));
  addServerPlugin(runtimeFile("./runtime/server/plugins/cached-no-cookies"));
  addServerPlugin(runtimeFile("./runtime/server/plugins/error-tracking"));
  // nitro runs close hooks in plugin order, and the worker must stop before the connections its jobs use
  addServerPlugin(runtimeFile("./runtime/server/plugins/worker"));
  if (nuxt.options.dev || process.env[DEVTOOLS_ENV] === "1") {
    addServerPlugin(runtimeFile("./runtime/server/observe/collector/plugin"));
  }
  addServerPlugin(runtimeFile("./runtime/server/plugins/close-connections"));
  addServerPlugin(runtimeFile("./runtime/server/plugins/pm2-ready"));
  addServerPlugin(runtimeFile("./runtime/server/plugins/drain-streams"));
  if (options.billing) addServerPlugin(runtimeFile("./runtime/server/billing/plugins/erasure"));
}
