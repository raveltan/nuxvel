import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineNuxtModule } from "nuxt/kit";
import type { NuxtHooks } from "nuxt/schema";

const devtoolsTabs = defineNuxtModule({
  meta: { name: "probes-devtools-tabs" },
  setup(_options, nuxt) {
    if (!nuxt.options.test || !nuxt.options.dev) return;
    // DevTools turns itself off under test, so the tab tests read the tab list its client would get from this file
    nuxt.hook("ready", async () => {
      const tabs: Parameters<NuxtHooks["devtools:customTabs"]>[0] = [];
      await nuxt.callHook("devtools:customTabs", tabs);
      mkdirSync(nuxt.options.buildDir, { recursive: true });
      writeFileSync(join(nuxt.options.buildDir, "devtools-tabs.json"), JSON.stringify(tabs));
    });
  },
});

export default defineNuxtConfig({
  buildDir: process.env.PLAYGROUND_BUILD_DIR,
  modules: [devtoolsTabs],
  nuxvel: {
    form: { inputs: { money: "ProbeMoneyInput" } },
    rendering: {
      "/_rendering/cached": "cached",
      "/zh/_rendering/cached": "cached",
      "/_rendering/private": "private",
      "/_rendering/client": "client",
      "/_flags-cached": "cached",
      "/_cached-posts": "cached",
      "/_rendering-gone/**": "cached",
    },
  },
});
