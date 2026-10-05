import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, visit } from "@nuxvel/nuxt/testing";
import { afterAll, describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import type { Page } from "playwright-core";
import { setupApp } from "./helpers/playground";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const appDir = scratchAppDir("outdated-build");

createScratchApp(appDir);
mkdirSync(join(appDir, "app", "pages"));
writeFileSync(join(appDir, "app", "app.vue"), "<template><NuxtPage /></template>\n");
writeFileSync(
  join(appDir, "app", "pages", "index.vue"),
  '<template><NuxtLink to="/next" :prefetch="false">Next page</NuxtLink></template>\n',
);
writeFileSync(join(appDir, "app", "pages", "next.vue"), "<template><h1>Next page</h1></template>\n");
afterAll(() => removeScratchApp(appDir));

function reloadOf(page: Page, pathname: string) {
  return page.waitForRequest((request) => request.isNavigationRequest() && new URL(request.url()).pathname === pathname);
}

describe("an open tab of an older build", async () => {
  // Nuxt skips its outdated-build check in a test build
  await setupApp({ rootDir: appDir, browser: true, nuxtConfig: { test: false } });

  it("reloads on the next navigation once a newer build is live", async () => {
    const page = await createPage();
    await page.clock.install();
    await page.goto(url("/"), { waitUntil: "hydration" });

    await page.route("**/_nuxt/builds/latest.json*", (route) =>
      route.fulfill({ json: { id: "a-newer-build", timestamp: Date.now() } }),
    );
    const checked = page.waitForResponse((response) => response.url().includes("/_nuxt/builds/latest.json"));
    await page.clock.runFor(CHECK_INTERVAL_MS);
    await checked;

    const reload = reloadOf(page, "/next");
    await page.getByRole("link", { name: "Next page" }).click();
    await reload;
    await page.getByRole("heading", { name: "Next page" }).waitFor();

    await page.close();
  });

  it("navigates in the tab while its build is the latest", async () => {
    const page = await visit("/");

    const navigations: string[] = [];
    page.on("request", (request) => {
      if (request.isNavigationRequest()) navigations.push(request.url());
    });
    await page.getByRole("link", { name: "Next page" }).click();
    await page.getByRole("heading", { name: "Next page" }).waitFor();

    expect(navigations).toEqual([]);
  });

  it("reloads the page it navigates to when a chunk of the old build fails to load", async () => {
    const page = await createPage();
    await page.goto(url("/"), { waitUntil: "hydration" });

    await page.route("**/_nuxt/**/*.js", (route) => route.abort());
    const reload = reloadOf(page, "/next");
    await page.getByRole("link", { name: "Next page" }).click();

    expect(new URL((await reload).url()).pathname).toBe("/next");

    await page.close();
  });
});
