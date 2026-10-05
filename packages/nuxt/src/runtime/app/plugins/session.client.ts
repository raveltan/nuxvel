import { defineNuxtPlugin, getRouteRules, onNuxtReady } from "#app";
import { refreshSession } from "../auth/session";

function renderedForEveryone(path: string) {
  const rules = getRouteRules({ path });

  return Boolean(rules.payload || rules.cache || rules.isr || rules.swr || rules.prerender);
}

/**
 * Loads the session in the browser after hydration when the page came
 * from a shared render (`payload`, `cache`, `isr`, `swr` or `prerender` route
 * rules). That render had no cookie, so its payload carries a `null`
 * session; `useUser()` then updates to the real user. Named
 * `nuxvel:session`.
 */
export default defineNuxtPlugin({
  name: "nuxvel:session",
  setup(nuxtApp) {
    if (!renderedForEveryone(window.location.pathname)) return;

    onNuxtReady(() => nuxtApp.runWithContext(refreshSession));
  },
});
