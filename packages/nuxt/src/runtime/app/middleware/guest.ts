import { defineNuxtRouteMiddleware, navigateTo } from "#app";
import { useI18n } from "#imports";
import { loadSession } from "../auth/session";

/**
 * Route middleware that redirects signed-in visitors to `/` in the locale
 * of the page, for pages only a guest should see, such as sign-in.
 *
 * Registered as the named middleware `"guest"`; it runs only on pages
 * that list it. It reads the session state `useUser()` shares, so it
 * fetches the session at most once per server render and not again on
 * client-side navigation.
 *
 * @example
 * ```ts
 * definePageMeta({ middleware: "guest" });
 * ```
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { localePath, getLocale } = useI18n();
  if (await loadSession()) return navigateTo(localePath("/", getLocale(to)));
});
