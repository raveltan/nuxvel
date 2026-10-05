import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from "#app";
import { useI18n } from "#imports";
import { loadSession } from "../auth/session";

/**
 * Route middleware that redirects signed-out visitors to
 * `nuxvel.auth.signInPath` (`/` unless configured), in the locale of the
 * page: `/zh/profile` redirects to `/zh/sign-in`.
 *
 * Registered as the named middleware `"auth"`; it runs only on pages
 * that list it. It reads the session state `useUser()` shares, so it
 * fetches the session at most once per server render and not again on
 * client-side navigation.
 *
 * @example
 * ```ts
 * definePageMeta({ middleware: "auth" });
 * ```
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { localePath, getLocale } = useI18n();
  if (!(await loadSession())) return navigateTo(localePath(useRuntimeConfig().public.signInPath, getLocale(to)));
});
