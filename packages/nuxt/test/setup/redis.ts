import { afterEach } from "vitest";
import { Redis } from "ioredis";
import { TEST_REDIS_URL } from "@nuxvel/test-helpers/services";

export function workerRedisDatabaseIndex() {
  return Number(process.env.VITEST_POOL_ID ?? "1");
}

export function workerRedisUrl() {
  const url = new URL(TEST_REDIS_URL);
  url.pathname = `/${workerRedisDatabaseIndex()}`;
  return url.toString();
}

process.env.NUXT_REDIS_URL = workerRedisUrl();

export async function flushWorkerRedis() {
  const redis = new Redis(workerRedisUrl());
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}

afterEach(flushWorkerRedis);
