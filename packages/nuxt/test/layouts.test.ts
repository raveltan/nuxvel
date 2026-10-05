import { actingAs, button, expect, menu, menuitem } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("starter layouts", async () => {
  await setupPlayground({
    browser: true,
  });

  it("shows the signed-in user's email in the app layout's user menu, and signs out from it", async () => {
    const email = "app-layout@example.com";
    const page = await actingAs(await userFactory({ email })).visit("/protected");

    await button(page, email).click();
    await expect(menu(page)).toBeVisible();
    await menuitem(menu(page), "Sign out").click();

    await page.waitForURL(url("/"));
    const session = await page.request.get(url("/api/auth/get-session"));
    expect(await session.json()).toBeNull();

    await page.goto(url("/protected"), { waitUntil: "hydration" });
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });
});
