import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const appDir = scratchAppDir("pwa-off");

describe("an app without nuxvel.pwa", () => {
  beforeAll(() => {
    createScratchApp(appDir);
    writeFileSync(join(appDir, "nuxt.config.ts"), 'export default defineNuxtConfig({ modules: ["@nuxvel/nuxt"] });\n');
  });
  afterAll(() => removeScratchApp(appDir));

  it("installs no @vite-pwa/nuxt, links no manifest and adds no push routes", async () => {
    const nuxt = await loadNuxt({ cwd: appDir, dev: false, overrides: { buildDir: join(appDir, ".nuxt") } });

    try {
      const modules = nuxt.options._installedModules.map((installed) => installed.meta.name);
      const handlers = nuxt.options.serverHandlers.map((handler) => handler.route);

      expect(modules).toContain("@nuxvel/nuxt");
      expect(modules).not.toContain("@vite-pwa/nuxt");
      expect(nuxt.options.app.head.link ?? []).not.toContainEqual(expect.objectContaining({ rel: "manifest" }));
      expect(handlers).not.toContain("/api/push/subscribe");
      expect(nuxt.options.routeRules?.["/offline"]).toBeUndefined();
    } finally {
      await nuxt.close();
    }
  }, 60_000);
});
