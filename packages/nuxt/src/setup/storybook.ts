import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { addPluginTemplate, getLayerDirectories } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { defu } from "defu";
import { i18nOptions } from "./i18n-options";

type NamedPlugin = { name: string } | false | null | undefined;

export function includeStorybookTypes(nuxt: Nuxt) {
  if (nuxt.options.test || !existsSync(join(nuxt.options.rootDir, ".storybook"))) return;
  nuxt.hook("prepare:types", ({ nodeTsConfig }) => {
    nodeTsConfig.include ||= [];
    nodeTsConfig.include.push(relative(nuxt.options.buildDir, join(nuxt.options.rootDir, ".storybook/**/*")));
  });
}

export function typecheckStoriesApart(nuxt: Nuxt) {
  const { buildDir, rootDir } = nuxt.options;
  const stories = getLayerDirectories(nuxt).map((dirs) => relative(buildDir, join(dirs.app, "**/*.stories.ts")));
  const rootTsConfig = join(rootDir, "tsconfig.json");
  const referenced = existsSync(rootTsConfig) && readFileSync(rootTsConfig, "utf8").includes("tsconfig.storybook.json");
  nuxt.hook("modules:done", () => {
    nuxt.hook("prepare:types", ({ tsConfig }) => {
      const declarations = (tsConfig.include ?? []).filter((path) => path.endsWith(".d.ts"));
      if (referenced) tsConfig.exclude = [...(tsConfig.exclude ?? []), ...stories];
      mkdirSync(buildDir, { recursive: true });
      writeFileSync(join(buildDir, "tsconfig.storybook.json"), JSON.stringify({ extends: "./tsconfig.app.json", include: [...declarations, ...stories], exclude: [] }, null, 2));
    });
  });
}

export function dropFontsPluginInStorybook(nuxt: Nuxt) {
  nuxt.hook("vite:configResolved", (config) => {
    if (!isStorybookBuild(nuxt)) return;
    const plugins = config.plugins as NamedPlugin[] | undefined;
    const index = plugins?.findIndex((plugin) => plugin && "name" in plugin && plugin.name === "nuxt-fonts-public-assets");
    // @nuxt/fonts 0.14 serves fonts in Storybook with an event that h3 cannot read, and the rejection stops `nuxvel test:ui`
    if (plugins && index !== undefined && index !== -1) plugins.splice(index, 1);
  });
}

export function prebundleSanitizeHtmlInStorybook(nuxt: Nuxt) {
  if (!isStorybookBuild(nuxt)) return;
  nuxt.options.vite.optimizeDeps ||= {};
  // sanitize-html is CommonJS, and the browser needs Vite's pre-bundle to give it a default export
  nuxt.options.vite.optimizeDeps.include = [...(nuxt.options.vite.optimizeDeps.include ?? []), "sanitize-html"];
}

export function isStorybookBuild(nuxt: Nuxt) {
  return nuxt.options.buildId === "storybook";
}

export function storybookI18nOverrides(nuxt: Nuxt) {
  // the story page has no locale prefix, so the locale comes from the i18n state that the preview decorator sets
  return isStorybookBuild(nuxt) ? { overrides: { strategy: "no_prefix" as const } } : {};
}

function readMessages(file: string): Record<string, unknown> {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

export function localizeStorybook(nuxt: Nuxt, nuxvelLocalesDir: string) {
  if (!isStorybookBuild(nuxt)) return;
  const i18n = i18nOptions(nuxt);
  const locales = (i18n.locales ?? []).map((locale) => locale.code);
  const translationDir = i18n.translationDir ?? "locales";
  nuxt.options.vite.define = {
    ...nuxt.options.vite.define,
    __NUXVEL_STORYBOOK_LOCALES__: JSON.stringify({ locales, defaultLocale: i18n.defaultLocale ?? locales[0] ?? "en" }),
  };
  addPluginTemplate({
    filename: "nuxvel-storybook-i18n.mjs",
    mode: "client",
    getContents() {
      const messages = Object.fromEntries(
        locales.map((code) => [code, defu({}, ...nuxt.options._layers.map((layer) => readMessages(join(layer.config.rootDir, translationDir, `${code}.json`))), readMessages(join(nuxvelLocalesDir, `${code}.json`)))]),
      );
      return `import { defineNuxtPlugin } from "#app";
const messages = ${JSON.stringify(messages)};
export default defineNuxtPlugin({
  name: "nuxvel:storybook-i18n",
  enforce: "pre",
  setup(nuxtApp) {
    nuxtApp.hook("i18n:register", (register, locale) => register(messages[locale] ?? {}, locale));
  },
});
`;
    },
  });
}
