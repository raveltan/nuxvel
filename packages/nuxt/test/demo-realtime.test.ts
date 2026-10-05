import type { Page } from "playwright-core";
import { describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { actingAs, expect, expectAccessible } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { mutateInBrowser } from "./helpers/browser-trpc";
import { setupPlayground } from "./helpers/playground";

async function listeningOnPosts(email: string) {
  const page = await createPage();
  await actingAs(await userFactory({ email })).login(page);
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
    const writer = await listeningOnPosts("demo-realtime-writer@example.com");
    const reader = await listeningOnPosts("demo-realtime-reader@example.com");

    await mutateInBrowser(writer, "post.create", { title: "Pushed live", body: "" });

    await reader.getByRole("cell", { name: "Pushed live", exact: true }).waitFor();
    await expect
      .poll(() => writer.getByRole("cell", { name: "Pushed live", exact: true }).count())
      .toBe(1);
    expect(await stillSamePageLoad(reader)).toBe(true);
    expect(await stillSamePageLoad(writer)).toBe(true);
    await expectAccessible(reader);

    await writer.close();
    await reader.close();
  });
});
