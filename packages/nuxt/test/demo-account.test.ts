import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { actingAs, expect, expectAccessible } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { mutateInBrowser } from "./helpers/browser-trpc";
import { setupPlayground } from "./helpers/playground";

describe("playground demo: account", async () => {
  await setupPlayground({
    browser: true,
  });

  it("lists the caller's posts, newest first", async () => {
    const page = await actingAs(await userFactory({ email: "demo-account@example.com" })).visit("/");

    await mutateInBrowser(page, "post.create", { title: "First post", body: "One" });
    await mutateInBrowser(page, "post.create", { title: "Second post", body: "Two" });
    // post.create flashes a toast, and Nuxt UI's open toast fails expectAccessible
    await page.context().clearCookies({ name: "nuxvel-flash" });

    await page.goto(url("/account"), { waitUntil: "hydration" });

    const rows = page.getByRole("table").locator("tbody tr");
    await expect.poll(() => rows.count()).toBe(2);
    expect(await rows.nth(0).textContent()).toContain("Second post");
    expect(await rows.nth(1).textContent()).toContain("First post");
    await expectAccessible(page);
  });
});
