import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, it } from "vitest";
import { stripVTControlCharacters } from "node:util";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import { expect, expectMailSent, expectQueued, guest } from "@nuxvel/nuxt/testing";
import type { CollectedEntry } from "../../src/runtime/server/observe/collector/collected-entry";
import { startQueueWorker } from "../helpers/queue-worker";

async function collectedEntry(id: string) {
  let found: CollectedEntry | undefined;

  await expect
    .poll(
      async () => {
        const entries = await guest().$fetch<CollectedEntry[]>("/_nuxvel/test/collected");
        found = entries.find((entry) => entry.id === id);
        return found;
      },
      { timeout: 20_000 },
    )
    .toBeDefined();

  if (!found) throw new Error(`no collected entry ${id}`);

  return found;
}

describe("the dev collector", () => {
  it("keeps a request's query, job dispatch and mail in the request's entry", async () => {
    const requestId = randomUUID();

    await guest().$fetch("/api/_collector-check", { headers: { "x-request-id": requestId } });

    const entry = await collectedEntry(requestId);

    expect(entry).toMatchObject({ kind: "request", label: "GET /api/_collector-check", status: 200 });
    expect(entry.spans).toContainEqual(
      expect.objectContaining({ type: "db:query", data: expect.objectContaining({ sql: expect.stringContaining('from "posts"') }) }),
    );
    expect(entry.spans).toContainEqual(
      expect.objectContaining({ type: "job:dispatch", data: { name: "_probe.record", payload: { name: "collected" } } }),
    );
    expect(entry.spans).toContainEqual(
      expect.objectContaining({
        type: "mail:send",
        data: { name: "welcome", input: { to: "collected@nuxvel.test", name: "Ada" } },
      }),
    );
  });

  it("keeps a request's cache misses and hits in the request's entry", async () => {
    const requestId = randomUUID();

    await guest().$fetch("/api/_cache-check", { query: { scenario: "remembered" }, headers: { "x-request-id": requestId } });

    const lookups = (await collectedEntry(requestId)).spans.filter((span) => span.type === "cache:lookup");

    expect(lookups.map((span) => span.data)).toEqual([
      { key: "probe:remembered", hit: false },
      { key: "probe:remembered", hit: true },
      { key: "probe:remembered", hit: false },
    ]);
  });

  it("keeps a console.warn in the request's entry, and prints it once as a nuxvel line", async () => {
    const requestId = randomUUID();

    await guest().$fetch("/api/_console-devtools-check", { headers: { "x-request-id": requestId } });

    expect((await collectedEntry(requestId)).spans).toContainEqual(
      expect.objectContaining({ type: "log", data: { level: "warn", tag: "console", message: "console-devtools warning" } }),
    );

    const printed = getServerLogs()
      .filter((line) => line.includes("console-devtools warning"))
      .map((line) => stripVTControlCharacters(line));

    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain(`req=${requestId.slice(0, 8)}`);
  });

  it("keeps the payload size warning in the page's entry", async () => {
    const requestId = randomUUID();

    expect((await guest().fetch("/_payload-size", { headers: { "x-request-id": requestId } })).status).toBe(200);

    expect((await collectedEntry(requestId)).spans).toContainEqual(
      expect.objectContaining({
        type: "log",
        data: expect.objectContaining({ level: "warn", tag: "console", message: expect.stringContaining("The payload of /_payload-size") }),
      }),
    );
  });

  it("observes alongside the test fakes, which still record", async () => {
    await guest().$fetch("/api/_collector-check");

    await expectQueued("_probe.record", { name: "collected" });
    await expectMailSent("welcome", { to: "collected@nuxvel.test" });
  });

  describe("with `queue:work` running under NUXVEL_DEVTOOLS=1", () => {
    let worker: Awaited<ReturnType<typeof startQueueWorker>>;
    let queue: Queue;

    beforeAll(async () => {
      queue = new Queue("nuxvel", {
        connection: { url: process.env.NUXT_REDIS_URL, maxRetriesPerRequest: null },
      });
      await queue.obliterate({ force: true });
      worker = await startQueueWorker({ NUXVEL_DEVTOOLS: "1" });
    }, 90_000);

    afterAll(async () => {
      await worker?.stop();
      await queue?.close();
    });

    it("shows a job the worker ran, with its queries, through the Redis stream", async () => {
      const job = await queue.add("_probe.record", { version: 1, payload: { name: "streamed" } }, { jobId: randomUUID() });

      const entry = await collectedEntry(`job:${job.id}`);

      expect(entry).toMatchObject({ kind: "job", label: "_probe.record" });
      expect(entry.error).toBeUndefined();
      expect(entry.durationMs).toBeGreaterThan(0);
      expect(entry.spans).toContainEqual(
        expect.objectContaining({
          type: "db:query",
          data: expect.objectContaining({ sql: expect.stringContaining('insert into "health_checks"') }),
        }),
      );
    }, 30_000);

    it("keeps a failed job's error, with its stack, and its failure log line in the job's entry", async () => {
      const job = await queue.add("_probe.always-fails", { version: 1, payload: {} }, { attempts: 1, jobId: randomUUID() });

      const entry = await collectedEntry(`job:${job.id}`);

      expect(entry.error).toBe("probe.always-fails always fails");
      expect(entry.spans).toContainEqual(
        expect.objectContaining({
          type: "error",
          data: expect.objectContaining({
            message: "probe.always-fails always fails",
            stack: expect.stringContaining("always-fails"),
          }),
        }),
      );
      expect(entry.spans).toContainEqual(
        expect.objectContaining({
          type: "log",
          data: expect.objectContaining({
            level: "error",
            message: expect.stringContaining(`_probe.always-fails #${job.id} failed (attempt 1/1)`),
          }),
        }),
      );
    }, 30_000);

    it("counts a job added without attempts as one attempt in its failure log line", async () => {
      const job = await queue.add("_probe.always-fails", { version: 1, payload: {} }, { jobId: randomUUID() });

      const entry = await collectedEntry(`job:${job.id}`);

      expect(entry.spans).toContainEqual(
        expect.objectContaining({
          type: "log",
          data: expect.objectContaining({
            level: "error",
            message: expect.stringContaining(`_probe.always-fails #${job.id} failed (attempt 1/1)`),
          }),
        }),
      );
    }, 30_000);

    it("keeps only the last 100 entries on the stream, and cuts a span past 16 KB", async () => {
      const names = Array.from({ length: 50 }, (_, index) => String(index).padEnd(1000, "x"));
      const large = await queue.add("_probe.large-query", { version: 1, payload: { names } }, { jobId: randomUUID() });

      const bulk = await queue.addBulk(
        Array.from({ length: 110 }, (_, index) => ({
          name: "_probe.record",
          data: { version: 1, payload: { name: `trimmed-${index}` } },
          opts: { jobId: randomUUID() },
        })),
      );

      const entry = await collectedEntry(`job:${large.id}`);
      const query = entry.spans.find((span) => span.type === "db:query");

      expect(query).toMatchObject({ truncated: true, data: { sql: expect.stringContaining('from "health_checks"') } });
      expect(JSON.stringify(query).length).toBeLessThan(17 * 1024);

      const bulkIds = new Set(bulk.map((job) => `job:${job.id}`));

      await expect
        .poll(
          async () => {
            const entries = await guest().$fetch<CollectedEntry[]>("/_nuxvel/test/collected");
            return entries.filter((collected) => bulkIds.has(collected.id)).length;
          },
          { timeout: 30_000 },
        )
        .toBe(bulk.length);

      const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");

      try {
        expect(await redis.xlen("nuxvel:devtools:entries")).toBe(100);
      } finally {
        redis.disconnect();
      }
    }, 60_000);
  });

  it("leaves nuxvel's own routes out", async () => {
    const entries = await guest().$fetch<CollectedEntry[]>("/_nuxvel/test/collected");

    expect(entries.some((entry) => entry.label.includes("/_nuxvel/"))).toBe(false);
  });
});
