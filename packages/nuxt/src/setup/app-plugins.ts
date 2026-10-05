import { addPlugin } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import type { RuntimeFile } from "./resolved-options";
import { addZodLocales } from "./zod-locale";

export function addAppPlugins(nuxt: Nuxt, runtimeFile: RuntimeFile) {
  addPlugin(runtimeFile("./runtime/app/plugins/head-snapshot.server"));
  addPlugin(runtimeFile("./runtime/app/plugins/trpc-error-payload"));
  addPlugin(runtimeFile("./runtime/app/plugins/trpc-not-found.server"));
  addPlugin(runtimeFile("./runtime/app/plugins/trpc"));
  addPlugin(runtimeFile("./runtime/app/plugins/flags"));
  addPlugin(runtimeFile("./runtime/app/plugins/session.client"));
  addPlugin(runtimeFile("./runtime/app/plugins/flash"));
  addPlugin(runtimeFile("./runtime/app/plugins/error-tracking.client"));
  addZodLocales(runtimeFile);
  if (nuxt.options.dev) addPlugin(runtimeFile("./runtime/app/plugins/payload-size.server"));
}
