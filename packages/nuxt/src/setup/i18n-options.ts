import type { Nuxt } from "@nuxt/schema";
import type { ModuleOptions as I18nOptions } from "nuxt-i18n-micro";

export function i18nOptions(nuxt: Nuxt): I18nOptions {
  // nuxt-i18n-micro adds its hooks to @nuxt/schema but not its `i18n` key to NuxtOptions
  return (nuxt.options as { i18n?: I18nOptions }).i18n ?? {};
}
