import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Nuxt } from "@nuxt/schema";
import { i18nOptions } from "./i18n-options";

export function nuxvelLocalesDir(nuxt: Nuxt): string {
  return join(nuxt.options.buildDir, "nuxvel-locales");
}

export function writeNuxvelLocales(nuxt: Nuxt, sourceDir: string): string {
  const dir = nuxvelLocalesDir(nuxt);
  mkdirSync(dir, { recursive: true });
  const { locales = [] } = i18nOptions(nuxt);
  for (const code of new Set(["en", ...locales.map((locale) => locale.code)])) {
    const source = [code, code.split("-")[0], "en"].map((candidate) => join(sourceDir, `${candidate}.json`)).find((file) => existsSync(file));
    if (source) copyFileSync(source, join(dir, `${code}.json`));
  }
  return dir;
}
