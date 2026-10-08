import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { setupApp } from "./helpers/playground";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const appDir = scratchAppDir("dev-scratch-app-base-url");
const remote = { "x-forwarded-for": "10.0.0.5" };

beforeAll(() => {
  createScratchApp(appDir);
  mkdirSync(join(appDir, "layers/base-url"), { recursive: true });
  writeFileSync(
    join(appDir, "app/app.vue"),
    `<script setup lang="ts">
import { TRPCClientError } from "@trpc/client";
import { $api } from "@nuxvel/nuxt/app/api";

const { data: code } = await useAsyncData("keys", async () => {
  try {
    await $api.apiKeys.list.query();
    return "none";
  } catch (error) {
    return error instanceof TRPCClientError ? error.data?.code : "other";
  }
});
</script>

<template><div>trpc error: {{ code }}</div></template>
`,
  );
  writeFileSync(join(appDir, "layers/base-url/nuxt.config.ts"), 'export default defineNuxtConfig({ app: { baseURL: "/app/" } });\n');
});
afterAll(() => removeScratchApp(appDir));

await setupApp({ rootDir: appDir, dev: true });

describe("the dev server under app.baseURL", () => {
  it("refuses a remote request to the DevTools API and the queue board", async () => {
    expect((await guest().fetch("/app/_nuxvel/devtools/api/entries/x", { headers: remote })).status).toBe(403);
    expect((await guest().fetch("/app/_nuxvel/queue", { headers: remote })).status).toBe(403);
  });

  it("lets the handler answer a request from this machine", async () => {
    expect((await guest().fetch("/app/_nuxvel/devtools/api/entries/x")).status).toBe(404);
  });

  it("serves the tRPC endpoint under the base and calls it from a server-rendered page", async () => {
    expect((await guest().fetch("/app/api/trpc/apiKeys.list")).status).toBe(401);
    expect(await (await guest().fetch("/app/")).text()).toContain("trpc error: UNAUTHORIZED");
  });
});
