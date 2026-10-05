import { describe, it } from "vitest";
import { expect, expectNotQueued, expectQueued, guest } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("dispatchAfterCommit()", async () => {
  await setupPlayground();

  it("never fires when the enclosing transaction rolls back", async () => {
    await guest().$fetch("/api/_dispatch-after-commit-check");
    await expectNotQueued("_probe.record", { name: "rolled-back" });
  });

  it("fires once with the right payload when the enclosing transaction commits", async () => {
    await guest().$fetch("/api/_dispatch-after-commit-check");
    await expectQueued("_probe.record", { name: "committed" });
  });

  it("fires immediately when called outside any transaction", async () => {
    await guest().$fetch("/api/_dispatch-after-commit-check");
    await expectQueued("_probe.record", { name: "immediate" });
  });

  it("takes the job's definition in place of its name", async () => {
    await guest().$fetch("/api/_dispatch-after-commit-check");
    await expectQueued("_probe.record", { name: "by-definition" });
  });

  it("drops a nested transaction's dispatches when its savepoint rolls back", async () => {
    await guest().$fetch("/api/_dispatch-after-commit-check");
    await expectNotQueued("_probe.record", { name: "nested-rolled-back" });
    await expectQueued("_probe.record", { name: "nested-committed" });
  });

  it("throws for a name no job defines and writes no outbox row", async () => {
    const body = await guest().$fetch("/api/_dispatch-after-commit-check");

    expect(body).toMatchObject({
      unknown: 'No job is named "probe.missing"',
      unknownRows: 0,
    });
  });
});
