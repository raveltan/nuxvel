import { describe, it } from "vitest";
import { expect, guest, useRealQueue } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("two relays claiming the same rows", async () => {
  await setupPlayground();

  useRealQueue();

  it("enqueues each row exactly once and never waits on the other relay", async () => {
    const body = await guest().$fetch("/api/_outbox-dedupe-check");

    expect(body).toMatchObject({
      whileClaimed: 0,
      afterRelease: 3,
      jobs: 3,
      undispatched: 0,
    });
  });
});
