import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { buildAndClose } from "./helpers/build-nuxt";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

function scratchAppWith(label: string, files: Record<string, string>) {
  const appDir = scratchAppDir(label);

  beforeAll(() => {
    createScratchApp(appDir);
    writeFileSync(join(appDir, "app", "app.vue"), "<template><NuxtPage /></template>\n");

    for (const [file, source] of Object.entries(files)) {
      mkdirSync(dirname(join(appDir, file)), { recursive: true });
      writeFileSync(join(appDir, file), source);
    }
  });
  afterAll(() => removeScratchApp(appDir));

  return appDir;
}

function build(appDir: string) {
  return loadNuxt({ cwd: appDir, dev: false, overrides: { buildDir: join(appDir, ".nuxt") } }).then(buildAndClose);
}

describe("a page under a reserved prefix", () => {
  const appDir = scratchAppWith("reserved-page", {
    "app/pages/index.vue": "<template><div /></template>\n",
    "app/pages/webhooks/stripe.vue": "<template><div /></template>\n",
  });

  it("fails the build, naming the page", async () => {
    await expect(build(appDir)).rejects.toThrow(
      `nuxvel: ${join(appDir, "app/pages/webhooks/stripe.vue")} is the page /webhooks/stripe, under /webhooks, which is reserved for the server; move the page`,
    );
  }, 120_000);
});

describe("a server route at the path of a page", () => {
  const appDir = scratchAppWith("route-shadows-page", {
    "app/pages/posts/[id].vue": "<template><div /></template>\n",
    "server/routes/posts/[slug].get.ts": "export default defineEventHandler(() => 'post');\n",
  });

  it("fails the build, naming both files", async () => {
    await expect(build(appDir)).rejects.toThrow(
      `nuxvel: ${join(appDir, "server/routes/posts/[slug].get.ts")} serves /posts/:slug, the path of the page ${join(appDir, "app/pages/posts/[id].vue")}; rename one of them`,
    );
  }, 120_000);
});
