import { expect, guest } from "@nuxvel/nuxt/testing";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { startQueueWorker } from "./helpers/queue-worker";

describe("the outbox relay wakes on LISTEN/NOTIFY", async () => {
  await setupPlayground();

  let worker: Awaited<ReturnType<typeof startQueueWorker>>;
  let queue: Queue;

  beforeAll(async () => {
    queue = new Queue("nuxvel", { connection: { url: process.env.NUXT_REDIS_URL, maxRetriesPerRequest: null } });
    await queue.obliterate({ force: true });
    worker = await startQueueWorker();
  }, 90_000);

  afterAll(async () => {
    await worker?.stop();
    await queue?.close();
  });

  async function queuedAt(name: string): Promise<number | undefined> {
    const jobs = await queue.getJobs(["waiting", "active", "completed", "failed"]);

    return jobs.find((job) => job.data?.payload?.name === name)?.timestamp;
  }

  async function relayDelay(name: string) {
    const { committedAt } = await guest().$fetch<{ committedAt: number }>("/api/_outbox-notify-check", { query: { name } });

    await expect.poll(() => queuedAt(name), { timeout: 5_000, interval: 10 }).toBeDefined();

    return ((await queuedAt(name)) ?? Infinity) - committedAt;
  }

  it("queues a committed job well under the 1 s poll interval", async () => {
    const delays = [await relayDelay("notify-1"), await relayDelay("notify-2"), await relayDelay("notify-3")].sort(
      (a, b) => a - b,
    );

    expect(delays[1], worker.output()).toBeLessThan(100);
  }, 30_000);
});
