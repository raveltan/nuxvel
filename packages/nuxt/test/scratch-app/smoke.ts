import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { expect, expectNoSmoke } from "@nuxvel/nuxt/testing";

const page = (title: string, script = "") =>
  `<script setup lang="ts">\nuseHead({ title: "${title}", htmlAttrs: { lang: "en" } });\n${script}</script>\n\n<template><main><h1>${title}</h1></main></template>\n`;

export const SMOKE_ROUTE_RULES = { "/smoke-feed.xml": { redirect: "/smoke-feed-index.xml" } };

export function addSmokePages(appDir: string) {
  mkdirSync(join(appDir, "app/pages/smoke-things"), { recursive: true });
  mkdirSync(join(appDir, "server/routes"), { recursive: true });
  writeFileSync(
    join(appDir, "server/routes/smoke-feed-index.xml.ts"),
    'export default defineEventHandler((event) => {\n  setHeader(event, "content-type", "application/xml");\n  return "<?xml version=\\"1.0\\"?><feed></feed>";\n});\n',
  );
  writeFileSync(
    join(appDir, "app/error.vue"),
    '<script setup lang="ts">\ndefineProps<{ error: { statusCode: number } }>();\n</script>\n\n<template><main><h1>{{ error.statusCode }}</h1></main></template>\n',
  );
  writeFileSync(join(appDir, "app/pages/smoke-clean.vue"), page("Clean"));
  writeFileSync(
    join(appDir, "app/pages/smoke-broken.vue"),
    page("Broken", 'await nextTick();\nonMounted(() => {\n  throw new Error("smoke page broke");\n});\n'),
  );
  writeFileSync(
    join(appDir, "app/pages/smoke-things/[id].vue"),
    page(
      "Thing",
      'if (useRoute().params.id !== "1") throw createError({ statusCode: 404, statusMessage: "Thing not found" });\n',
    ),
  );
}

describe("expectNoSmoke(extraPaths)", () => {
  it("fails with each page that has an error or a bad status, and skips routes with params and redirects", async () => {
    const failure = await expectNoSmoke(["/smoke-things/1", "/smoke-things/2"]).then(
      () => "",
      (error: Error) => error.message,
    );

    expect(failure).toMatch(/\/smoke-broken\n( {2}.*\n)* {2}error page: 500 smoke page broke/);
    expect(failure).toContain("/smoke-things/2\n  HTTP 404");
    expect(failure).not.toContain("/smoke-clean\n");
    expect(failure).not.toContain("/smoke-things/1\n");
    expect(failure).not.toContain(":id");
    expect(failure).not.toContain("/smoke-feed.xml");
  }, 120_000);
});
