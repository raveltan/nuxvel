import { fileURLToPath } from "node:url";
import { addPlugin, addTemplate, useNuxt } from "@nuxt/kit";
import type { ModuleOptions as I18nOptions } from "nuxt-i18n-micro";
import * as zodLocales from "zod/v4/locales";
import { i18nOptions } from "./i18n-options";
import type { RuntimeFile } from "./resolved-options";

type I18nLocale = NonNullable<I18nOptions["locales"]>[number];

function zodName(value: string) {
  const [language = "", region] = value.split(/[-_]/);
  return [`${language.toLowerCase()}${region?.toUpperCase() ?? ""}`, language.toLowerCase()];
}

function zodLocaleName({ code, iso }: I18nLocale): string {
  const names = Object.keys(zodLocales);
  return [iso, code].flatMap((value) => (value ? zodName(value) : [])).find((name) => names.includes(name)) ?? "en";
}

export function zodLocaleNames(locales: I18nLocale[]): Record<string, string> {
  return Object.fromEntries(locales.map((locale) => [locale.code, zodLocaleName(locale)]));
}

function appLocales() {
  return i18nOptions(useNuxt()).locales ?? [];
}

function zodLocalesModule() {
  const names = zodLocaleNames(appLocales());
  const imported = [...new Set(Object.values(names))];

  return [
    `import { ${imported.join(", ")} } from ${JSON.stringify(fileURLToPath(import.meta.resolve("zod/v4/locales")))};`,
    `export default { ${Object.entries(names).map(([code, name]) => `${JSON.stringify(code)}: ${name}`).join(", ")} };`,
  ].join("\n");
}

export function addZodLocales(runtimeFile: RuntimeFile) {
  if (appLocales().every((locale) => zodLocaleName(locale) === "en")) return;

  addTemplate({ filename: "nuxvel/zod-locales.mjs", getContents: zodLocalesModule });
  addTemplate({
    filename: "nuxvel/zod-locales.d.ts",
    write: true,
    getContents: () =>
      'import type { z } from "zod";\ndeclare const zodLocales: Partial<Record<string, () => { localeError: z.core.$ZodErrorMap }>>;\nexport default zodLocales;\n',
  });
  addPlugin(runtimeFile("./runtime/app/plugins/zod-locale.client"));
}
