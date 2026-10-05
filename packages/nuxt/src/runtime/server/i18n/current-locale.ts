import { AsyncLocalStorage } from "node:async_hooks";
import { getCookie, getRequestHeader, getRequestURL, type H3Event } from "h3";
import { useRuntimeConfig } from "nitropack/runtime";
import { LOCALE_HEADER } from "../../shared/trpc/locale-header";
import { currentEvent } from "../utils/current-event";

export const localeScope = new AsyncLocalStorage<string>();

function acceptedLocale(header: string | undefined, locales: string[]) {
  for (const range of (header ?? "").split(",")) {
    const tag = range.split(";")[0]?.trim().toLowerCase() ?? "";
    const found = locales.find((code) => code.toLowerCase() === tag || code.toLowerCase() === tag.split("-")[0]);
    if (found) return found;
  }
  return undefined;
}

function localeOf(event: H3Event): string {
  const { locales, defaultLocale, localeCookie } = useRuntimeConfig().i18nLocales;
  const known = (code: string | undefined) => (code && locales.includes(code) ? code : undefined);
  const path = getRequestURL(event).pathname.slice(useRuntimeConfig().app.baseURL.length - 1);

  return (
    known(getRequestHeader(event, LOCALE_HEADER)) ??
    known(path.split("/")[1]) ??
    known(localeCookie ? getCookie(event, localeCookie) : undefined) ??
    acceptedLocale(getRequestHeader(event, "accept-language"), locales) ??
    defaultLocale
  );
}

/**
 * Gives the locale code of the current request, for example `"zh"`.
 *
 * The order is: the route prefix (`/zh/...`), the `user-locale` cookie,
 * `Accept-Language`, then the default locale. A tRPC call from a page
 * sends the locale of that page, so a procedure gets the locale of the
 * page that calls it. In an action, it gives the `locale` of the action
 * context (see {@link defineAction}). Outside a request and an action,
 * for example in a job or a schedule, it gives the default locale.
 * Auto-imported on the server. A procedure gets the same value as
 * `ctx.locale`.
 *
 * @example
 * ```ts
 * const locale = currentLocale();
 * ```
 */
export function currentLocale(): string {
  const scoped = localeScope.getStore();
  if (scoped) return scoped;

  const event = currentEvent();

  return event ? localeOf(event) : useRuntimeConfig().i18nLocales.defaultLocale;
}
