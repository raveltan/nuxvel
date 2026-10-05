import { describe, it } from "vitest";
import { expect, guest, useRealQueue } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("dispatchAfterCommit() through the outbox", async () => {
  await setupPlayground();

  useRealQueue();

  it("writes the outbox row in the transaction and enqueues on relay", async () => {
    const body = await guest().$fetch("/api/_queue-dispatch-check");

    expect(body.pending).toEqual([
      { jobName: "_probe.record", payload: { version: 1, payload: { name: "queued" } } },
    ]);
    expect(body.beforeRelay).toEqual([]);
    expect(body.jobs).toEqual([
      { name: "_probe.record", data: { version: 1, payload: { name: "queued" } } },
    ]);
    expect(body.undispatched).toBe(0);
  });

  it("carries a dispatch's delay and priority through the outbox row into BullMQ, and refuses a priority out of range", async () => {
    const body = await guest().$fetch("/api/_dispatch-options-check");

    expect(body.rows).toEqual([
      { delay: 60_000, priority: null },
      { delay: null, priority: 3 },
    ]);
    expect(body.delayed).toEqual([{ name: "_probe.record", delay: 60_000 }]);
    expect(body.prioritized).toEqual([{ name: "_probe.record", priority: 3 }]);
    expect(body.refusal).toBe("ZodError");
    expect(body.written).toBe(2);
  });

  it("adds a job with the attempts, backoff and unique key of its defineJob, and skips a dispatch whose key is still queued", async () => {
    const body = await guest().$fetch("/api/_job-options-check");
    const tuned = { attempts: 5, backoff: { type: "fixed", delay: 10 } };

    expect(body.map(({ id: _id, ...job }) => job)).toEqual([
      { name: "_probe.tuned", data: { version: 1, payload: { name: "a" } }, ...tuned, deduplication: "_probe.tuned:a" },
      { name: "_probe.tuned", data: { version: 1, payload: { name: "b" } }, ...tuned, deduplication: "_probe.tuned:b" },
      {
        name: "_probe.record",
        data: { version: 1, payload: { name: "plain" } },
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        deduplication: null,
      },
    ]);
  });

  it("relays a job to the queue its defineJob names", async () => {
    const body = await guest().$fetch("/api/_named-queue-check");

    expect(body).toEqual({ default: ["_probe.record"], reports: ["_probe.record-report"], reportsBullName: "nuxvel-reports" });
  });
});
