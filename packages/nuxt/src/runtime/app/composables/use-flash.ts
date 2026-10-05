import { useState } from "#app";
import type { FlashMessage } from "../../shared/flash/flash-message";

/**
 * The flash messages that arrived with the current page, from
 * {@link flash} on the server. The list is empty when there are none,
 * and each navigation replaces it.
 *
 * Auto-imported. With Nuxt UI, each message also shows as a toast, so
 * most apps do not call it. With `nuxvel.ui: false`, render the list
 * yourself, for example in a layout.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const flashes = useFlash();
 * </script>
 *
 * <template>
 *   <p v-for="flash in flashes" :key="flash.message" role="status">{{ flash.message }}</p>
 * </template>
 * ```
 */
export function useFlash() {
  return useState<FlashMessage[]>("nuxvel:flash", () => []);
}
