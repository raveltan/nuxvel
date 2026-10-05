import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { Redis } from "ioredis";
import { setupPlayground } from "./helpers/playground";
import { TEST_REDIS_URL } from "@nuxvel/test-helpers/services";
import { workerRedisDatabaseIndex, workerRedisUrl } from "./setup/redis";
import { postJson } from "./helpers/auth-flows";

const CACHE_DATABASE = 63;

describe("useRedis with NUXT_REDIS_CACHE_URL", async () => {
  const cacheUrl = new URL(TEST_REDIS_URL);
  cacheUrl.pathname = `/${CACHE_DATABASE}`;

  await setupPlayground({ env: { NUXT_REDIS_CACHE_URL: cacheUrl.toString() } });

  it("connects the cache purpose to NUXT_REDIS_CACHE_URL and every other purpose to NUXT_REDIS_URL", async () => {
    expect(await guest().$fetch("/api/_redis-databases")).toEqual({
      queue: workerRedisDatabaseIndex(),
      cache: CACHE_DATABASE,
      pubsub: workerRedisDatabaseIndex(),
      durable: workerRedisDatabaseIndex(),
    });
  });

  it("keeps rate limits, sign-in delays, maintenance and flag targeting on NUXT_REDIS_URL, with the email hashed", async () => {
    const cache = new Redis(cacheUrl.toString());
    const durable = new Redis(workerRedisUrl());
    const email = "guessed@example.com";

    try {
      await cache.flushdb();
      await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: "correct-horse-battery-staple" });
      expect((await postJson("/api/auth/sign-in/email", { email, password: "a-wrong-password" })).status).toBe(401);
      await guest().$fetch("/api/_durable-state-check");

      const state = /rate-limit:|failed-sign-ins:|nuxvel:maintenance|nuxvel:flags:/;
      const durableKeys = await durable.keys("*");

      expect((await cache.keys("*")).filter((key) => state.test(key))).toEqual([]);
      expect(durableKeys).toEqual(expect.arrayContaining([
        expect.stringMatching(/rate-limit:/),
        expect.stringMatching(/^nuxvel:auth:failed-sign-ins:[0-9a-f]{64}$/),
        "nuxvel:maintenance",
        expect.stringMatching(/^nuxvel:flags:/),
      ]));
      expect(durableKeys.filter((key) => key.includes(email))).toEqual([]);
    } finally {
      cache.disconnect();
      durable.disconnect();
    }
  });
});
