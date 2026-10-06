import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const appDir = scratchAppDir("invalidate-fallback");

describe("nuxvel.api.invalidateFallback", () => {
  beforeAll(() => createScratchApp(appDir));
  afterAll(() => removeScratchApp(appDir));

  it.for([
    ["", "namespace"],
    ["nuxvel: { api: { invalidateFallback: false } }, ", false],
  ] as const)("reaches the public runtime config of the client (%s)", async ([config, expected]) => {
    writeFileSync(join(appDir, "nuxt.config.ts"), `export default defineNuxtConfig({ ${config}modules: ["@nuxvel/nuxt"] });\n`);
    const nuxt = await loadNuxt({ cwd: appDir, dev: false, overrides: { buildDir: join(appDir, ".nuxt") } });

    try {
      expect(nuxt.options.runtimeConfig.public.invalidateFallback).toBe(expected);
    } finally {
      await nuxt.close();
    }
  });
});
