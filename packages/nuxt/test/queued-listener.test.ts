import { describe, it } from "vitest";
import { expect, guest, useRealQueue } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("emit() with a queued listener", async () => {
  await setupPlayground();

  useRealQueue();

  it("enqueues the listener instead of running it inline", async () => {
    const body = await guest().$fetch("/api/_queued-listener-check");

    expect(body.rows).toEqual([]);
    expect(body.beforeRelay).toEqual([]);
    expect(body.jobs).toEqual([
      {
        name: "listener:_record-probe-queued",
        data: { version: 2, payload: { name: "queued-listener" } },
      },
    ]);
  });
});
