import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

type Exposure = { name: string; unitId: string; variant: string };

describe("flags on a cached page", async () => {
  await setupPlayground({
    browser: true,
  });

  it("shows a signed-in user their own value and records that value", async () => {
    await guest().$fetch("/api/_flag-targeting-check", {
      method: "POST",
      body: { roles: { user: true } },
    });

    expect(await guest().$fetch<string>("/_flags-cached")).toContain(
      "probe-rollout:false",
    );

    const page = await actingAs(await userFactory({ email: "cached-flags@example.com" })).visit("/_flags-cached");

    await expect
      .poll(() => page.locator(".flags").textContent())
      .toMatch(/^probe-rollout:true /);
    await expect
      .poll(() => guest().$fetch<Exposure[]>("/api/_flag-exposures-check"))
      .toContainEqual({
        name: "probe-rollout",
        unitId: expect.any(String),
        variant: "true",
      });
    expect(
      (await guest().$fetch<Exposure[]>("/api/_flag-exposures-check")).filter(
        (exposure) => exposure.name === "probe-rollout",
      ),
    ).toHaveLength(1);
  });
});
