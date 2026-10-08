import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addTemplate, useNuxt } from "@nuxt/kit";
import { i18nOptions } from "./i18n-options";

function uiLocaleName(names: string[], { code, iso }: { code: string; iso?: string }) {
  const candidates = [iso, code].flatMap((value) => {
    const name = value?.toLowerCase().replace("-", "_");
    return name ? [name, name.split("_")[0]] : [];
  });

  return candidates.find((name) => name && names.includes(name)) ?? "en";
}

async function uiLocalesModule() {
  const localeIndex = fileURLToPath(import.meta.resolve("@nuxt/ui/locale"));
  const names = Object.keys(await import("@nuxt/ui/locale"));
  const locales = i18nOptions(useNuxt()).locales ?? [];

  return [
    ...locales.map((locale, index) => `import l${index} from ${JSON.stringify(join(dirname(localeIndex), `${uiLocaleName(names, locale)}.js`))};`),
    `export default { ${locales.map(({ code }, index) => `${JSON.stringify(code)}: l${index}`).join(", ")} };`,
  ].join("\n");
}

export function addUiLocale() {
  addTemplate({ filename: "nuxvel/ui-locales.mjs", getContents: uiLocalesModule });
  addTemplate({
    filename: "nuxvel/ui-locales.d.ts",
    write: true,
    getContents: () =>
      'import type { Locale, Messages } from "@nuxt/ui";\ndeclare const uiLocales: Partial<Record<string, Locale<Messages>>>;\nexport default uiLocales;\n',
  });
}
