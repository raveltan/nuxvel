import { expect } from "@nuxvel/nuxt/testing";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, it } from "vitest";

import { startQueueWorker } from "./helpers/queue-worker";
import { setupPlayground } from "./helpers/playground";

const RETRIES = { attempts: 3, backoff: { type: "fixed", delay: 10 } };

describe("queue:work retries", async () => {
  await setupPlayground();

  let worker: Awaited<ReturnType<typeof startQueueWorker>>;
  let queue: Queue;

  beforeAll(async () => {
    queue = new Queue("nuxvel", {
      connection: { url: process.env.NUXT_REDIS_URL, maxRetriesPerRequest: null },
    });
    await queue.obliterate({ force: true });
    worker = await startQueueWorker();
  }, 90_000);

  afterAll(async () => {
    await worker?.stop();
    await queue?.close();
  });

  async function attemptsWhenFailed(name: string, data: unknown) {
    const job = await queue.add(name, data, RETRIES);

    await expect
      .poll(() => job.getState(), { timeout: 20_000, interval: 50 })
      .toBe("failed");

    const failed = await queue.getJob(job.id ?? "");
    return failed?.attemptsMade;
  }

  it("fails an invalid payload, a missing upcaster and an unknown job at once", async () => {
    expect(await attemptsWhenFailed("_probe.record", { version: 1, payload: { name: "" } })).toBe(1);
    expect(
      await attemptsWhenFailed("_probe.record-unmigrated", { version: 1, payload: { name: "x" } }),
    ).toBe(1);
    expect(await attemptsWhenFailed("probe.no-such-job", { version: 1, payload: {} })).toBe(1);
  }, 60_000);

  it("still retries a handler that throws", async () => {
    expect(await attemptsWhenFailed("_probe.always-fails", { version: 1, payload: {} })).toBe(3);
  }, 60_000);
});
