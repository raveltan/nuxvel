import { computed, type ComputedRef } from "vue";
import type { Flag } from "../../server/flags/define-flag";
import type { FlagName } from "../../server/flags/registry";
import { useLiveFlagValues } from "../flags/flag-values";

/**
 * Whether a flag is on for the current user, as a live ref.
 *
 * Auto-imported. It takes the flag's name or its entry in the
 * auto-imported `$flags` namespace (`$flags.newCheckout`). In the app,
 * `$flags` holds only the names, and go-to-definition on a key opens the
 * flag's file under `server/flags/`. The value is evaluated on the server — the page only
 * ever sees the result, never the targeting — and arrives in the SSR
 * payload, so the first render already shows it. While the component is
 * mounted it listens on the `flags` channel and refreshes when
 * `setFlagTargeting()` changes any flag, without a reload. It is `false`
 * only if the values could not be loaded at all.
 *
 * On mount it records an exposure through `POST /api/flags/exposures`:
 * the server re-evaluates the flag for the user — it never trusts a
 * value from the page — and keeps one row per user per value, so
 * rendering the page again records nothing new. On a `cached` or
 * prerendered page, rendered for a guest, the values are first reloaded
 * for the visitor, so the exposure matches what they end up seeing.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const newCheckout = useFlag("new-checkout");
 * const oneClick = useFlag($flags.checkout.oneClick);
 * </script>
 *
 * <template>
 *   <NewCheckout v-if="newCheckout" />
 * </template>
 * ```
 */
export function useFlag(flag: FlagName | Flag): ComputedRef<boolean> {
  const name = typeof flag === "string" ? flag : flag.name;
  const values = useLiveFlagValues(name);

  return computed(() => values.value?.flags[name] ?? false);
}
