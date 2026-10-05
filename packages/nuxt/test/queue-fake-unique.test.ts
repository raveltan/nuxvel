import { expectQueued, guest, workQueue } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("the queue fake and unique", async () => {
  await setupPlayground();

  it("drops a dispatch whose unique key is still queued, and queues it again after workQueue()", async () => {
    await guest().$fetch("/api/_unique-dispatch-check");
    await guest().$fetch("/api/_unique-dispatch-check");

    await expectQueued("_probe.tuned", { name: "a" }, { times: 1 });

    await workQueue();
    await guest().$fetch("/api/_unique-dispatch-check");

    await expectQueued("_probe.tuned", { name: "a" }, { times: 2 });
  });
});
