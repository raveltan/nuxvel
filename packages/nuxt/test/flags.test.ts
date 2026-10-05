import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("defineFlag / defineExperiment", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_flag-check");

  it("rolls a flag out by percentage and targets it by role, given its name or its definition", async () => {
    const body = probe();

    expect(body).toMatchObject({
      untargeted: 0,
      atZero: 0,
      atHundred: 200,
    });
    expect(body.atThirty).toBeGreaterThan(30);
    expect(body.atThirty).toBeLessThan(90);
    expect(body.atThirtyStable).toBe(true);
    expect(body.roleTargeted).toEqual([
      { role: "beta-tester", on: true },
      { role: "user", on: false },
      { role: "beta-tester", on: true },
      { role: "user", on: false },
    ]);
  });

  it("splits a started experiment's users between its variants, the same way every time, given its name or its definition", async () => {
    const body = probe();

    expect(body.green).toBeGreaterThan(70);
    expect(body.green).toBeLessThan(130);
    expect(body).toMatchObject({
      variantsStable: true,
      guestVariant: "control",
      controlBeforeStart: true,
    });
  });
});
