import { readonly, type DeepReadonly, type Ref } from "vue";
import { type NuxtApp, onNuxtReady, useCookie, useNuxtApp, useState } from "#app";

const TIMEZONE_COOKIE = "nuxvel-timezone";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

const followingBrowser = new WeakSet<NuxtApp>();

function isTimezone(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The IANA timezone dates render in, as a read-only ref.
 *
 * Auto-imported. It is the `nuxvel-timezone` cookie, or `UTC` until that
 * cookie exists, so the server and the hydrating browser always agree on
 * it — never the server's own clock or the browser's before hydration.
 * Once the page has hydrated, a browser in a different timezone switches
 * the ref to its own and stores it in the cookie, so the next server
 * render already uses it. {@link DateTime} formats with it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const timezone = useTimezone();
 * </script>
 *
 * <template>
 *   <p>Times are shown in {{ timezone }}.</p>
 * </template>
 * ```
 */
export function useTimezone(): DeepReadonly<Ref<string>> {
  const cookie = useCookie<string | null>(TIMEZONE_COOKIE, {
    maxAge: ONE_YEAR_IN_SECONDS,
    sameSite: "lax",
  });
  const timezone = useState("nuxvel:timezone", () =>
    isTimezone(cookie.value) ? cookie.value : "UTC",
  );

  const nuxtApp = useNuxtApp();

  if (import.meta.client && !followingBrowser.has(nuxtApp)) {
    followingBrowser.add(nuxtApp);
    onNuxtReady(() => {
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (timezone.value === browserTimezone) return;

      timezone.value = browserTimezone;
      cookie.value = browserTimezone;
    });
  }

  return readonly(timezone);
}
