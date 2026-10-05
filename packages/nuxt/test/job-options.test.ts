import { expect } from "@nuxvel/nuxt/testing";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, it } from "vitest";

import { startQueueWorker } from "./helpers/queue-worker";
import { setupPlayground } from "./helpers/playground";

describe("queue:work with the options of a defineJob", async () => {
  await setupPlayground();

  let worker: Awaited<ReturnType<typeof startQueueWorker>>;
  let queue: Queue;
  let limited: Queue;

  beforeAll(async () => {
    const connection = { url: process.env.NUXT_REDIS_URL, maxRetriesPerRequest: null };

    queue = new Queue("nuxvel", { connection });
    limited = new Queue("nuxvel-limited", { connection });
    await queue.obliterate({ force: true });
    await limited.obliterate({ force: true });
    worker = await startQueueWorker();
  }, 90_000);

  afterAll(async () => {
    await worker?.stop();
    await queue?.close();
    await limited?.close();
  });

  it("fails an attempt that runs past the timeout and retries it", async () => {
    const job = await queue.add("_probe.hangs", { version: 1, payload: {} }, { attempts: 2, backoff: 10 });

    await expect.poll(() => job.getState(), { timeout: 20_000, interval: 50 }).toBe("failed");

    const failed = await queue.getJob(job.id ?? "");

    expect(failed?.attemptsMade).toBe(2);
    expect(failed?.failedReason).toBe('Job "_probe.hangs" timed out after 100ms');
  }, 30_000);

  it("runs the queue of a job with a limiter at its rate", async () => {
    await limited.add("_probe.rate-limited", { version: 1, payload: {} });
    await limited.add("_probe.rate-limited", { version: 1, payload: {} });

    await expect.poll(() => limited.getCompletedCount(), { timeout: 20_000, interval: 50 }).toBe(1);
    await expect.poll(() => limited.getRateLimitTtl(1), { timeout: 5_000, interval: 50 }).toBeGreaterThan(0);
    expect(await limited.getWaitingCount()).toBe(1);
  }, 30_000);
});
