import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { startServer, stopServer } from "@nuxt/test-utils/e2e";
import { expect, expectNotQueued, guest, useRealQueue } from "@nuxvel/nuxt/testing";
import { waitingJobNames } from "./helpers/queue";
import { setupPlayground } from "./helpers/playground";

describe("useRealQueue()", async () => {
  await setupPlayground();

  useRealQueue();

  it("enqueues to the real queue", async () => {
    await guest().$fetch("/api/_queue-fake-check", { query: { name: randomUUID() } });

    await expectNotQueued("_probe.record");
    expect(await waitingJobNames()).toEqual(["_probe.record"]);

    await stopServer();
    await startServer();
  }, 60_000);

  it("still enqueues to the real queue after a server restart", async () => {
    await guest().$fetch("/api/_queue-fake-check", { query: { name: randomUUID() } });

    await expectNotQueued("_probe.record");
    expect(await waitingJobNames()).toEqual(["_probe.record"]);
  });
});
