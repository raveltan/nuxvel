import { addComponent, addImports, addServerHandler } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { defu } from "defu";
import { OFFLINE_PATH } from "../pwa";
import type { ResolvedOptions, RuntimeFile } from "./resolved-options";

export function setupPwa(nuxt: Nuxt, options: ResolvedOptions, runtimeFile: RuntimeFile) {
  const { pwa } = options;
  if (!pwa) return;

  // the worker serves this page under any URL it cannot load, where hydrating it would render that route instead
  nuxt.options.routeRules ??= {};
  nuxt.options.routeRules[OFFLINE_PATH] = defu(nuxt.options.routeRules[OFFLINE_PATH], { noScripts: true, robots: false });
  nuxt.hook("pages:extend", (pages) => {
    // an app without pages would get the router, and a 404 for every other URL, from this one page
    if (pages.length === 0 || pages.some((page) => page.path === OFFLINE_PATH)) return;
    pages.push({ name: "offline", path: OFFLINE_PATH, file: runtimeFile("./runtime/app/pwa/offline.vue") });
  });
  if (!nuxt.options.dev) {
    const { head } = nuxt.options.app;
    head.link = [...(head.link ?? []), { rel: "manifest", href: `${nuxt.options.app.baseURL}manifest.webmanifest` }];
    if (pwa.themeColor) head.meta = [...(head.meta ?? []), { name: "theme-color", content: pwa.themeColor }];
  }
  nuxt.options.nitro.publicAssets = [
    ...(nuxt.options.nitro.publicAssets ?? []),
    { dir: runtimeFile("./runtime/pwa"), maxAge: 0 },
  ];
  addImports({ name: "usePush", from: runtimeFile("./runtime/app/pwa/use-push") });
  if (options.ui) {
    addComponent({ name: "PwaInstallPrompt", filePath: runtimeFile("./runtime/app/ui/PwaInstallPrompt.vue") });
    addComponent({ name: "PushToggle", filePath: runtimeFile("./runtime/app/ui/PushToggle.vue") });
  }
  addServerHandler({
    route: "/api/push/subscribe",
    method: "post",
    handler: runtimeFile("./runtime/server/routes/push-subscribe"),
  });
  addServerHandler({
    route: "/api/push/subscribe",
    method: "delete",
    handler: runtimeFile("./runtime/server/routes/push-unsubscribe"),
  });
}
