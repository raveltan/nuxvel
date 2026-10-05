import { describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { actingAs, expect } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("actingAs(user).login(page)", async () => {
  await setupPlayground({ browser: true });

  it("opens a private page without the sign-in form", async () => {
    const page = await createPage();

    await actingAs(await userFactory()).login(page);
    await page.goto(url("/protected"), { waitUntil: "hydration" });

    expect(new URL(page.url()).pathname).toBe("/protected");
    await page.getByText("protected", { exact: true }).waitFor();
  });

  it("leaves a page without login signed out", async () => {
    const page = await createPage();

    await page.goto(url("/protected"), { waitUntil: "hydration" });

    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });
});
