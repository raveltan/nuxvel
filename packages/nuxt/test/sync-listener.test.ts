import { describe, it } from "vitest";
import { expect, expectEmitted, expectListenerRan, guest } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("emit() with a sync listener", async () => {
  await setupPlayground();

  it("commits and rolls back the listener's write with the emitting action", async () => {
    const body = await guest().$fetch("/api/_sync-listener-check");

    expect(body.afterRollback).toEqual([]);
    expect(body.afterCommit).toEqual(["sync-committed"]);

    await expectEmitted("_probe.happened", { name: "sync-committed" });
    await expectListenerRan("_record-probe-sync");
  });

  it("runs a listener that names its event through $events", async () => {
    await guest().$fetch("/api/_sync-listener-check");

    await expectListenerRan("_record-probe-namespaced");
  });
});
