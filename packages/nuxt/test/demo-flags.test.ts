import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { actingAs, expect, expectAccessible, guest } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("playground demo: flags", async () => {
  await setupPlayground({
    browser: true,
  });

  it("flips the flag-dependent button live when the user's targeting changes", async () => {
    const page = await actingAs(await userFactory({ email: "demo-flags@example.com" })).visit("/");
    const connected = page.waitForResponse((response) => response.url().includes("/api/channels"));
    await page.goto(url("/flags"), { waitUntil: "hydration" });
    await connected;

    expect(await page.locator('[data-flag="probe-rollout"]').textContent()).toBe("off");
    expect(await page.locator('[data-flag="probe-cta"]').textContent()).toBe("control");
    await page.getByRole("button", { name: "Use the classic flow" }).waitFor();
    await expectAccessible(page);

    await guest().$fetch("/api/_flag-targeting-check", {
      method: "POST",
      body: { roles: { user: true } },
    });

    await page.getByRole("button", { name: "Try the new flow" }).waitFor();
    expect(await page.locator('[data-flag="probe-rollout"]').textContent()).toBe("on");
    await expectAccessible(page);
  });
});
