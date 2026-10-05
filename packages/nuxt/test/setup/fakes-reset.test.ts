import { describe, it } from "vitest";
import { actingAs, expect, expectEmitted, expectMailSent, expectQueued, guest } from "@nuxvel/nuxt/testing";
import { healthCheckFactory } from "../../../../playground/server/factories/health-checks.factory";
import { userFactory } from "../../../../playground/server/factories/users.factory";
import { recordedEffects } from "../../src/testing/recorded";
import { setupPlayground } from "../helpers/playground";

describe("the fake reset hooks", async () => {
  await setupPlayground();

  it("records a dispatch, an emit, a queued job and a sent mail", async () => {
    const owner = await userFactory();
    const healthCheck = await healthCheckFactory({ userId: owner.id });

    await actingAs(owner).trpc.health.update({ id: healthCheck.id, name: "after" });
    await guest().$fetch("/api/_sync-listener-check");
    await guest().$fetch("/api/_queue-fake-check", { query: { name: "reset-probe" } });
    await guest().$fetch("/api/_mail-suppression-check", {
      query: { to: "reset-probe@nuxvel.test", suppressed: "no" },
    });

    await expectQueued("health-check.notify-on-update");
    await expectEmitted("_probe.happened");
    await expectQueued("_probe.record", { name: "reset-probe" });
    await expectMailSent("welcome", { to: "reset-probe@nuxvel.test" });
  });

  it("is cleared by the afterEach hook from the previous test", async () => {
    const recorded = await recordedEffects();

    const { logs, ...effects } = recorded;

    expect(Object.values(effects).flat()).toEqual([]);
    expect(logs.filter((line) => line.tag !== "request")).toEqual([]);
  });
});
