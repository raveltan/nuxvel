import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Nuxt } from "@nuxt/schema";
import type { SeoOptions } from "../seo";
import { i18nOptions } from "./i18n-options";

export function nuxvelLocalesDir(nuxt: Nuxt): string {
  return join(nuxt.options.buildDir, "nuxvel-locales");
}

function siteConfigMessages(seo: SeoOptions | undefined) {
  if (!seo) return {};
  return { nuxtSiteConfig: { name: seo.siteName, description: seo.defaultDescription ?? "" } };
}

export function writeNuxvelLocales(nuxt: Nuxt, sourceDir: string, seo: SeoOptions | undefined): string {
  const dir = nuxvelLocalesDir(nuxt);
  mkdirSync(dir, { recursive: true });
  const { locales = [] } = i18nOptions(nuxt);
  for (const code of new Set(["en", ...locales.map((locale) => locale.code)])) {
    const source = [code, code.split("-")[0], "en"].map((candidate) => join(sourceDir, `${candidate}.json`)).find((file) => existsSync(file));
    if (!source) continue;
    const messages = { ...JSON.parse(readFileSync(source, "utf8")), ...siteConfigMessages(seo) };
    writeFileSync(join(dir, `${code}.json`), JSON.stringify(messages));
  }
  return dir;
}
