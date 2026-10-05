import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, describe, it } from "vitest";
import { Redis } from "ioredis";
import { TEST_REDIS_URL } from "@nuxvel/test-helpers/services";
import { flushWorkerRedis, workerRedisDatabaseIndex, workerRedisUrl } from "./redis";

describe("per-worker redis database index", () => {
  const redis = new Redis(workerRedisUrl());

  afterAll(() => redis.quit());

  it("points the app at this worker's own database index", () => {
    expect(process.env.NUXT_REDIS_URL).toBe(workerRedisUrl());
    expect(redis.options.db).toBe(workerRedisDatabaseIndex());
  });

  it("keeps a key written to another database index out of this one", async () => {
    const other = new Redis(`${TEST_REDIS_URL}/0`);

    try {
      await other.set("shared-probe", "other-index");
      await redis.set("shared-probe", "this-worker");

      expect(await other.get("shared-probe")).toBe("other-index");
      expect(await redis.get("shared-probe")).toBe("this-worker");
    } finally {
      await other.del("shared-probe");
      await other.quit();
    }
  });

  it("flushes this worker's database between tests", async () => {
    await redis.set("shared-probe", "left-behind");

    await flushWorkerRedis();

    expect(await redis.get("shared-probe")).toBeNull();
  });
});
