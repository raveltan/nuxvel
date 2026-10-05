import { resolveUnrefHeadInput } from "@unhead/vue/utils";
import { defineNuxtPlugin, injectHead } from "#app";

export default defineNuxtPlugin({
  name: "nuxvel:head-snapshot",
  enforce: "pre",
  setup(nuxtApp) {
    // @pinia/colada-nuxt clears the query cache on app:rendered, and the head renders after it: resolve head getters on query data first
    nuxtApp.hooks.hook("app:rendered", () => {
      for (const entry of injectHead().entries.values()) {
        const input = resolveUnrefHeadInput(entry.input);
        if (!input) continue;
        // @unhead/vue types a resolved head as unhead's ResolvableHead, a static subset its entry type does not name
        entry.input = input as typeof entry.input;
        delete entry._tags;
      }
    });
  },
});
