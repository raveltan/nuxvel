import { defineNuxtPlugin, getRouteRules, useRequestFetch } from "#app";
import type { FlagValues } from "../../shared/flags/flag-values";
import { revalidateFlagValues, useFlagValues } from "../flags/flag-values";

function renderedForEveryone(path: string) {
  const rules = getRouteRules({ path });

  return Boolean(rules.payload || rules.prerender);
}

/**
 * Loads the current user's flag values from `GET /api/flags` during SSR,
 * so they ride along in the payload and `useFlag()` / `useExperiment()`
 * render the right value before hydration, with no flicker. A failed
 * load never fails the page: the browser tries again. A page served
 * from a cache was rendered for a guest, so the browser reloads the
 * values for its own user before recording any exposure. Named
 * `nuxvel:flags`, and runs in parallel with the other plugins.
 */
export default defineNuxtPlugin({
  name: "nuxvel:flags",
  parallel: true,
  async setup() {
    const state = useFlagValues();

    if (state.value !== undefined) {
      if (import.meta.client && renderedForEveryone(window.location.pathname)) {
        revalidateFlagValues(state);
      }
      return;
    }

    state.value = await useRequestFetch()<FlagValues>("/api/flags").catch(
      () => undefined,
    );
  },
});
