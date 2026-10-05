import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { addPluginTemplate, addVitePlugin } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { defu } from "defu";
import { i18nOptions } from "./i18n-options";

export const STORYBOOK_PORT_ENV = "NUXVEL_STORYBOOK_PORT";

type NamedPlugin = { name: string } | false | null | undefined;

function usesStorybook(nuxt: Nuxt, storybook: boolean | undefined) {
  return storybook !== false && !nuxt.options.test && existsSync(join(nuxt.options.rootDir, ".storybook"));
}

export function storybookDependency(nuxt: Nuxt, storybook: boolean | undefined) {
  // npm can nest @nuxtjs/storybook under @nuxvel/nuxt, where Nuxt's lookup by name in the app's node_modules misses it
  if (!usesStorybook(nuxt, storybook)) return {};
  const port = process.env[STORYBOOK_PORT_ENV];
  return { [fileURLToPath(import.meta.resolve("@nuxtjs/storybook"))]: port ? { overrides: { port: Number(port) } } : {} };
}

export function includeStorybookTypes(nuxt: Nuxt, storybook: boolean | undefined) {
  if (!usesStorybook(nuxt, storybook)) return;
  nuxt.hook("prepare:types", ({ nodeTsConfig }) => {
    nodeTsConfig.include ||= [];
    nodeTsConfig.include.push(relative(nuxt.options.buildDir, join(nuxt.options.rootDir, ".storybook/**/*")));
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

function isStorybookVite(plugins: readonly NamedPlugin[]) {
  return plugins.some((plugin) => plugin && plugin.name === "storybook:code-generator-plugin");
}

function resolvable(root: string, entry: string) {
  try {
    createRequire(join(root, "package.json")).resolve(entry);
    return true;
  } catch {
    return false;
  }
}

function dropUnresolvableStorybookDeps(root: string, include: string[] | undefined) {
  if (!include) return;
  const stale = include.filter(
    (entry) => entry === "storybook > @storybook/core > jsdoc-type-pratt-parser" || (entry === "react-dom/client" && !resolvable(root, entry)),
  );
  for (const entry of stale) include.splice(include.indexOf(entry), 1);
}

export function adaptInheritedViteToStorybook(nuxt: Nuxt) {
  if (!nuxt.options.dev) return;
  addVitePlugin({
    name: "nuxvel:storybook",
    configResolved(config) {
      const plugins = config.plugins as NamedPlugin[];
      if (!isStorybookVite(plugins)) return;
      const devServer = plugins.findIndex((plugin) => plugin && plugin.name === "nuxt:dev-server");
      // @storybook-vue/nuxt 10 copies Nuxt's plugins into Storybook's Vite; this one swaps Nuxt's dev handler for Storybook's, whose proxy then sends Nuxt's requests back to Nuxt in a loop
      if (devServer !== -1) plugins.splice(devServer, 1);
      // @storybook-vue/nuxt 10 pre-bundles a Storybook 9 path and react-dom, which Vite reports as unresolvable on every start
      dropUnresolvableStorybookDeps(config.root, config.optimizeDeps.include);
      const portlessUrl = process.env.PORTLESS_URL;
      if (portlessUrl && typeof config.server.hmr === "object") {
        config.server.hmr.clientPort = Number(new URL(portlessUrl).port || 443);
      }
    },
    transformIndexHtml(_html, { server }) {
      if (!server || !isStorybookVite(server.config.plugins)) return;
      return [{ tag: "script", children: "window.__NUXT_DEVTOOLS_DISABLE__ = true", injectTo: "head-prepend" }];
    },
  });
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
