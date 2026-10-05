import { expect, guest } from "@nuxvel/nuxt/testing";
import { Redis } from "ioredis";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

async function store(entries: Record<string, string>) {
  const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");

  try {
    for (const [key, value] of Object.entries(entries)) await redis.set(key, value);
  } finally {
    await redis.quit();
  }
}

describe("stored flag state", async () => {
  await setupPlayground();

  it("falls back to the defaults when what is stored is garbage", async () => {
    await store({
      "nuxvel:flags:probe-rollout": "not json",
      "nuxvel:experiments:probe-cta": JSON.stringify({ running: true }),
    });

    expect(await guest().$fetch("/api/flags")).toMatchObject({
      flags: { "probe-rollout": false },
      experiments: { "probe-cta": "control" },
    });
  });

  it("records an exposure once per request however often the flag is read", async () => {
    expect(await guest().$fetch("/api/_flag-exposure-queries-check")).toEqual({ queries: 1 });
  });
});
