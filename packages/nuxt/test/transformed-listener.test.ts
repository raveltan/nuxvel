import { describe, it } from "vitest";
import { expect, guest, useRealQueue } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("emit() with an event schema that transforms", async () => {
  await setupPlayground();

  useRealQueue();

  it("hands the sync and the queued listener the payload transformed once", async () => {
    const body = await guest().$fetch("/api/_transformed-listener-check");

    expect(body.afterEmit).toEqual(["sync:transformed-a", "sync:transformed-b"]);
    expect(body.queuedPayload).toEqual({
      version: 1,
      payload: { names: "transformed-a,transformed-b" },
    });
    expect(body.afterQueuedRun).toEqual([
      "queued:transformed-a",
      "queued:transformed-b",
      "sync:transformed-a",
      "sync:transformed-b",
    ]);
  });
});
