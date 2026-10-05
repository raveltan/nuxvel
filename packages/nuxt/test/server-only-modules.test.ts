import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { buildAndClose } from "./helpers/build-nuxt";
import { playgroundBuild } from "./helpers/playground";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const appDir = scratchAppDir("server-only-modules");

describe("a page importing a generated #nuxvel module", () => {
  beforeAll(() => {
    createScratchApp(appDir);
    mkdirSync(join(appDir, "app/pages"), { recursive: true });
    writeFileSync(
      join(appDir, "app/pages/index.vue"),
      `<script setup lang="ts">
import * as schema from "#nuxvel/schema";

const tables = Object.keys(schema);
</script>

<template><p>{{ tables.length }}</p></template>
`,
    );
  });
  afterAll(() => removeScratchApp(appDir));

  it("fails the build instead of bundling server code into the app", async () => {
    const nuxt = await loadNuxt({ cwd: appDir, dev: false, overrides: { buildDir: join(appDir, ".nuxt") } });

    await expect(buildAndClose(nuxt)).rejects.toThrow(
      /#nuxvel\/schema is generated server code and cannot be imported from .*app\/pages\/index\.vue/,
    );
  }, 120_000);
});

describe("the client namespaces", () => {
  it.for([
    ["$flags", "probe-rollout", "expiresAt"],
    ["$experiments", "probe-cta", "probe.converted"],
    ["$channels", "_probe-public", "That title is rejected"],
    ["$jobs", "demo.countdown", "The countdown failed on purpose"],
  ] as const)("%s bundles only the name %s, not the server file", ([, name, serverOnly]) => {
    const assets = join(playgroundBuild().outputDir, "public", "_nuxt");
    const chunks = readdirSync(assets)
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFileSync(join(assets, file), "utf8"))
      .filter((source) => source.includes(name));

    expect(chunks.join()).toMatch(new RegExp(`name:\\s*["'\`]${name}["'\`]`));
    expect(chunks.join()).not.toContain(serverOnly);
  });
});
