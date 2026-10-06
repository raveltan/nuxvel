import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("a job's dispatcher", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_job-dispatcher-check");

  function run(name: string) {
    return probe().runs.find((entry: { name: string }) => entry.name === name);
  }

  it("records the dispatching procedure's or action's actor, and runs the job as it", () => {
    const { userId } = probe();
    const actor = { type: "user", id: userId, role: "user", userId };

    expect(run("procedure")).toEqual({ name: "procedure", userId, actor, dispatcher: actor });
    expect(run("action")).toEqual({ name: "action", userId, actor, dispatcher: actor });
  });

  it("stores the dispatcher with the payload on the outbox row", () => {
    const { userId, stored } = probe();

    expect(stored[0]).toEqual({ version: 1, payload: { name: "procedure" }, dispatcher: { type: "user", id: userId, role: "user", userId } });
  });

  it("runs as the dispatcher the dispatch names instead", () => {
    const actor = { type: "system", id: "_job-dispatcher-check" };

    expect(run("overridden")).toEqual({ name: "overridden", userId: null, actor, dispatcher: actor });
  });

  it("runs as nobody when the dispatch clears the dispatcher or nobody dispatched it", () => {
    expect(run("cleared")).toEqual({ name: "cleared", userId: null, actor: null, dispatcher: null });
    expect(run("signed-out")).toEqual({ name: "signed-out", userId: null, actor: null, dispatcher: null });
  });
});
