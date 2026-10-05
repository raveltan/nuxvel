import { fileURLToPath } from "node:url";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupApp } from "./helpers/playground";

describe("the playground's test probes in a build not made for tests", async () => {
  await setupApp({
    rootDir: fileURLToPath(new URL("../../../playground", import.meta.url)),
    nuxtConfig: { test: false },
  });

  it("are not served", async () => {
    expect((await guest().fetch("/api/_redis-check")).status).toBe(404);
    expect((await guest().fetch("/_ui")).status).toBe(404);
    expect((await guest().fetch("/_rendering/cached")).status).toBe(404);
    expect((await guest().fetch("/api/channels/_probe-public")).status).toBe(404);
    expect((await guest().fetch("/api/channels/job:_probe.always-fails")).status).toBe(404);
    expect((await guest().fetch("/api/webhooks/_probe", { method: "POST" })).status).toBe(404);
    expect((await guest().fetch("/api/trpc/_errorFormatterCheck.throwPlain")).status).toBe(404);
  });

  it("still serves the demo", async () => {
    expect((await guest().fetch("/sign-in")).status).toBe(200);
    expect((await guest().fetch("/api/health/live")).status).toBe(200);
  });
});
