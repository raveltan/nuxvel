import { defineNuxtPlugin, useRequestEvent, useRouter } from "#app";
import { deleteCookie, getCookie, getRequestHeader } from "h3";
import { FLASH_COOKIE, parseFlashMessages } from "../../shared/flash/flash-message";
import { useFlash } from "../composables/use-flash";

function takeBrowserFlashes() {
  const pair = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${FLASH_COOKIE}=`));

  if (!pair) return [];

  document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0; samesite=lax`;
  return parseFlashMessages(decodeURIComponent(pair.slice(FLASH_COOKIE.length + 1)));
}

/**
 * Moves the `nuxvel-flash` cookie that {@link flash} sets into
 * {@link useFlash}, then deletes the cookie. During SSR it reads the
 * request's cookie, but only for a page the browser opens: a page that a
 * script or the PWA service worker fetches leaves the cookie for the next
 * page. In the browser it reads the cookie after hydration, when the
 * service worker fetched the page and the cookie is still there, and after
 * each client-side navigation.
 */
export default defineNuxtPlugin({
  name: "nuxvel:flash",
  setup(nuxtApp) {
    const flashes = useFlash();

    if (import.meta.server) {
      const event = useRequestEvent();

      if (!event || (getRequestHeader(event, "sec-fetch-dest") ?? "document") !== "document") return;

      flashes.value = parseFlashMessages(getCookie(event, FLASH_COOKIE));
      deleteCookie(event, FLASH_COOKIE, { path: "/" });
      return;
    }

    if (nuxtApp.isHydrating) {
      nuxtApp.hooks.hookOnce("app:suspense:resolve", () => {
        const left = takeBrowserFlashes();
        if (left.length > 0) flashes.value = left;
      });
    }

    useRouter().afterEach((_to, from, failure) => {
      if (failure || from.matched.length === 0 || nuxtApp.isHydrating) return;
      flashes.value = takeBrowserFlashes();
    });
  },
});
