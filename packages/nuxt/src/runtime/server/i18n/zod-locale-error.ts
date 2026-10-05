import { z } from "zod";
import { useRuntimeConfig } from "nitropack/runtime";

const errorMaps = new Map<string, z.core.$ZodErrorMap>();

function isZodLocale(name: string): name is keyof typeof z.locales {
  return name in z.locales;
}

export function zodLocaleError(locale: string): z.core.$ZodErrorMap {
  const zodLocales: Partial<Record<string, string>> = useRuntimeConfig().i18nLocales.zodLocales;
  const name = zodLocales[locale] ?? "en";
  const known = errorMaps.get(name);
  if (known) return known;

  const errorMap = z.locales[isZodLocale(name) ? name : "en"]().localeError;
  errorMaps.set(name, errorMap);
  return errorMap;
}
