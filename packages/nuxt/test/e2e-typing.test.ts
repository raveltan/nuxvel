import { describe, it } from "vitest";
import { actingAs, button, expect, field, text, trpcSpy, visit } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("typing, timers and hover with visit(target, { clock: true })", async () => {
  await setupPlayground({ browser: true });

  it("sends one search call after the debounce, when the test runs the browser timers", { timeout: 20_000 }, async () => {
    const page = await visit("/_post-search", { clock: true });
    const list = trpcSpy(page, "post.list");

    await field(page, "Search").pressSequentially("hello");
    await page.clock.runFor(299);
    await expect(list).not.toHaveBeenCalled();

    await page.clock.runFor(1);
    await expect(list).toHaveBeenCalledWith({ q: "hello" });
    await expect(text(page, "0 posts")).toBeVisible();
    await expect(list).toHaveBeenCalledTimes(1);
  });

  it("validates while the user types and shows a tooltip on hover, as actingAs(user)", { timeout: 20_000 }, async () => {
    const page = await actingAs(await userFactory()).visit("/_post-search", { clock: true });
    const title = field(page, "Title");

    await title.pressSequentially("ab");
    await page.clock.runFor(300);
    await expect(text(page, "Title needs at least 3 characters")).toBeVisible();
    await title.pressSequentially("c");
    await page.clock.runFor(300);
    await expect(text(page, "Title needs at least 3 characters")).toHaveCount(0);

    await button(page, "Save draft").hover();
    await page.clock.runFor(1000);
    await expect(text(page, "Saves the draft")).toBeVisible();
    await page.mouse.move(0, 0);
    await page.clock.runFor(1000);
    await expect(text(page, "Saves the draft")).toHaveCount(0);
  });
});
