import { computed, type ComputedRef } from "vue";
import { en } from "@nuxt/ui/locale";
import type { Locale, Messages } from "@nuxt/ui";
import { useI18n } from "#imports";
import uiLocales from "#build/nuxvel/ui-locales";

/**
 * Returns the Nuxt UI locale of the current i18n locale, as a computed ref.
 *
 * Auto-imported unless the app sets `nuxvel.ui: false`. Pass it to
 * `<UApp :locale>` in `app.vue`, so the labels of the Nuxt UI components
 * (close buttons, the calendar, the pagination) follow the route locale.
 * The module bundles only the Nuxt UI locales of the `i18n.locales` of the
 * app. It finds them by the `iso` of each locale, for example `zh_cn` for
 * `zh-CN`, then by its language (`de` for `de-DE`). A locale that Nuxt UI
 * does not have gets `en`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const uiLocale = useUiLocale();
 * </script>
 *
 * <template>
 *   <UApp :locale="uiLocale">
 *     <NuxtPage />
 *   </UApp>
 * </template>
 * ```
 */
export function useUiLocale(): ComputedRef<Locale<Messages>> {
  const { getLocale } = useI18n();

  return computed(() => uiLocales[getLocale()] ?? en);
}
