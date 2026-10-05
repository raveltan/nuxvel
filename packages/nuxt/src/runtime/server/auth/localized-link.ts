import { useRuntimeConfig } from "nitropack/runtime";

function localePath(path: string, locale: string) {
  const { locales, defaultLocale, strategy } = useRuntimeConfig().i18nLocales;
  const [, first = "", ...rest] = path.split("/");
  const bare = locales.includes(first) ? `/${rest.join("/")}` : path;

  if (strategy === "no_prefix" || (locale === defaultLocale && strategy !== "prefix")) return bare;

  return `/${locale}${bare === "/" ? "" : bare}`;
}

export function localizedLink(url: string, locale: string): string {
  const link = new URL(url);
  const callback = link.searchParams.get("callbackURL");

  if (!callback?.startsWith("/") || callback.startsWith("//")) return url;

  link.searchParams.set("callbackURL", localePath(callback, locale));

  return link.toString();
}
