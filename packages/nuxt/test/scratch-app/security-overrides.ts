import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { CONSOLE_PROBE_MESSAGE, consoleProbeChunk } from "../helpers/console-probe";

export const ownSecurityOptions = {
  strict: false,
  rateLimiter: { tokensPerInterval: 1000, interval: 60_000, headers: true },
  removeLoggers: false,
};

export function addConsoleProbePage(appDir: string) {
  mkdirSync(join(appDir, "app", "pages"), { recursive: true });
  writeFileSync(
    join(appDir, "app", "pages", "console-probe.vue"),
    `<script setup lang="ts">\nonMounted(() => console.log("${CONSOLE_PROBE_MESSAGE}"));\n</script>\n\n<template><p>Console probe page</p></template>\n`,
  );
}

describe("an app's own security options", () => {
  it("keeps client console calls in production when the app sets removeLoggers: false", () => {
    const outputDir = useTestContext().nuxt?.options.nitro.output?.dir ?? "";

    expect(consoleProbeChunk(outputDir)).toContain(CONSOLE_PROBE_MESSAGE);
  });

  it("turns the strict preset off when the app sets strict: false", async () => {
    const response = await guest().fetch("/");

    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("content-security-policy")).not.toContain("default-src 'none'");
  });

  it("turns nuxt-security's rate limiter on when the app configures it", async () => {
    const response = await guest().fetch("/api/health/live");

    expect(response.headers.get("x-ratelimit-limit")).toBe("1000");
  });
});
