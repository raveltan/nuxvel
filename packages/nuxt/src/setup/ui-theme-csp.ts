import { createHash } from "node:crypto";
import { findPath, getLayerDirectories, importModule } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { defuFn } from "defu";
import { join } from "node:path";
import colors from "tailwindcss/colors";

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const COLOR_MODE_TRANSITION_STYLE =
  "*{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}";

function hashSource(text: string) {
  return `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
}

type Palette = Record<string, Record<number, string> | string>;
type UiConfig = { colors: Record<string, string>; prefix?: string };

function shade(color: string, value: number) {
  const palette = (colors as Palette)[color];

  return typeof palette === "object" ? (palette[value] ?? "") : "";
}

function shades(key: string, value: string, prefix: string | undefined) {
  const prefixed = prefix ? `${prefix}-` : "";
  const name = value === "neutral" ? "old-neutral" : value;

  return SHADES.map((step) => `--ui-color-${key}-${step}: var(--${prefixed}color-${name}-${step}, ${shade(value, step)});`).join("\n  ");
}

function aliases(keys: string[], step: number) {
  return keys.map((key) => `--ui-${key}: var(--ui-color-${key}-${step});`).join("\n  ");
}

function themeStyle(config: UiConfig) {
  const { neutral: _neutral, ...chromatic } = config.colors;
  const keys = Object.keys(chromatic);

  return `@layer theme {
  :root, :host {
  ${Object.entries(config.colors)
    .map(([key, value]) => shades(key, value, config.prefix))
    .join("\n  ")}
  }
  :root, :host, .light {
  ${aliases(keys, 500)}
  }
  .dark {
  ${aliases(keys, 400)}
  }
}`;
}

async function resolvedUiConfig(nuxt: Nuxt): Promise<UiConfig | undefined> {
  const files = await Promise.all(getLayerDirectories(nuxt).map((dirs) => findPath(join(dirs.app, "app.config"))));
  const globals = globalThis as { defineAppConfig?: <T>(config: T) => T };
  // app.config.ts calls defineAppConfig as an auto-import, which does not exist outside the Nuxt build
  globals.defineAppConfig ??= (config) => config;
  const configs = await Promise.all(files.filter((file) => file !== null).map((file) => importModule<{ default: object }>(file)));
  const merged = [...configs.map((config) => config.default), nuxt.options.appConfig].reduce((merged, config) => defuFn(merged, config)) as { ui?: Partial<UiConfig> };

  return merged.ui?.colors ? { colors: merged.ui.colors, prefix: merged.ui.prefix } : undefined;
}

export function allowUiThemeStyle(nuxt: Nuxt) {
  nuxt.hook("nitro:config", async (config) => {
    const security = config.runtimeConfig?.security as
      | { headers?: { contentSecurityPolicy?: Record<string, unknown> | false } | false }
      | undefined;
    const policy = security?.headers ? security.headers.contentSecurityPolicy : undefined;
    const sources = policy ? policy["style-src"] : undefined;

    if (!policy || !Array.isArray(sources) || sources.includes("'unsafe-inline'")) return;

    const ui = await resolvedUiConfig(nuxt);

    policy["style-src"] = [...sources, hashSource(COLOR_MODE_TRANSITION_STYLE), ...(ui ? [hashSource(themeStyle(ui))] : [])];
  });
}
