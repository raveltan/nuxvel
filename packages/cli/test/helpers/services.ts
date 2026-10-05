import { connect } from "node:net";
import { TEST_REDIS_URL } from "@nuxvel/test-helpers/services";
import { Redis } from "ioredis";
import { onTestFinished, vi } from "vitest";

const CLI_REDIS_DATABASE_OFFSET = 32;

export function workerRedisUrl() {
  const url = new URL(TEST_REDIS_URL);
  url.pathname = `/${CLI_REDIS_DATABASE_OFFSET + Number(process.env.VITEST_POOL_ID ?? "1")}`;
  return url.toString();
}

export async function flushWorkerRedis() {
  const redis = new Redis(workerRedisUrl());

  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}

export async function emptyWorkerRedis() {
  await flushWorkerRedis();
  onTestFinished(flushWorkerRedis);

  return workerRedisUrl();
}

export function waitFor<T>(check: () => Promise<T | undefined>, timeout = 60000) {
  return vi.waitFor(
    async () => {
      const result = await check();
      if (result === undefined) throw new Error("waitFor timed out");
      return result;
    },
    { timeout, interval: 250 },
  );
}

export function listening(port: number) {
  return new Promise<true | undefined>((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.on("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(undefined));
  });
}
