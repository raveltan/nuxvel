import { describe, it } from "vitest";
import { expectNotQueued, expectQueued, guest } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("$jobs.x.dispatch()", async () => {
  await setupPlayground();

  it("never fires when the enclosing transaction rolls back", async () => {
    await guest().$fetch("/api/_job-dispatch-check");
    await expectNotQueued("_probe.record", { name: "rolled-back" });
  });

  it("fires once with the right payload when the enclosing transaction commits", async () => {
    await guest().$fetch("/api/_job-dispatch-check");
    await expectQueued("_probe.record", { name: "committed" });
  });

  it("fires immediately when called outside any transaction", async () => {
    await guest().$fetch("/api/_job-dispatch-check");
    await expectQueued("_probe.record", { name: "immediate" });
  });

  it("drops a nested transaction's dispatches when its savepoint rolls back", async () => {
    await guest().$fetch("/api/_job-dispatch-check");
    await expectNotQueued("_probe.record", { name: "nested-rolled-back" });
    await expectQueued("_probe.record", { name: "nested-committed" });
  });
});
