import type { Page } from "playwright-core";
import { describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { actingAs, expect, expectAccessible } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { mutateInBrowser } from "./helpers/browser-trpc";
import { setupPlayground } from "./helpers/playground";

async function listeningOnPosts(user: { id: string; email: string }) {
  const page = await createPage();
  await actingAs(user).login(page);
  const connected = page.waitForResponse((response) => response.url().includes("/api/channels"));
  await page.goto(url("/posts"), { waitUntil: "hydration" });
  await connected;
  await page.evaluate(() => Object.assign(window, { loadedOnce: true }));
  return page;
}

function stillSamePageLoad(page: Page) {
  return page.evaluate(() => "loadedOnce" in window);
}

describe("playground demo: live posts", async () => {
  await setupPlayground({
    browser: true,
  });

  it("shows a post created in one session in another without a reload", async () => {
    const writer = await listeningOnPosts(await userFactory({ email: "demo-realtime-writer@example.com" }));
    const reader = await listeningOnPosts(await userFactory({ email: "demo-realtime-reader@example.com" }));

    await mutateInBrowser(writer, "post.create", { title: "Pushed live", body: "" });

    await reader.getByRole("cell", { name: "Pushed live", exact: true }).waitFor();
    await expect
      .poll(() => writer.getByRole("cell", { name: "Pushed live", exact: true }).count())
      .toBe(1);
    expect(await reader.getByRole("link", { name: "Edit Pushed live" }).count()).toBe(0);
    expect(await stillSamePageLoad(reader)).toBe(true);
    expect(await stillSamePageLoad(writer)).toBe(true);
    await expectAccessible(reader);

    await writer.close();
    await reader.close();
  });

  it("refetches the list on a created post, so its author sees Edit and Delete in another tab", async () => {
    const author = await userFactory({ email: "demo-realtime-author@example.com" });
    const page = await listeningOnPosts(author);

    await actingAs(author).trpc.post.create({ title: "Mine live", body: "" });

    await page.getByRole("link", { name: "Edit Mine live" }).waitFor();
    await expect(page.getByRole("button", { name: "Delete Mine live" })).toBeVisible();
    expect(await stillSamePageLoad(page)).toBe(true);

    await page.close();
  });
});
