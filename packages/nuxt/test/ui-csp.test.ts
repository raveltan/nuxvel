import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { expect, fillForm, guest, visit } from "@nuxvel/nuxt/testing";
import { setupApp, withoutPlaygroundImgSrc } from "./helpers/playground";

describe("Nuxt UI under the strict Content Security Policy", async () => {
  await setupApp({
    rootDir: fileURLToPath(new URL("../../../playground", import.meta.url)),
    browser: true,
    nuxtConfig: {
      srcDir: fileURLToPath(new URL("./fixtures/ui-app", import.meta.url)),
      hooks: withoutPlaygroundImgSrc,
      nuxvel: { rendering: { "/client": "client" } },
    },
  });

  it("renders a loading button, a toast's close icon, a select and a progress bar at 0% without a CSP violation", async () => {
    const page = await visit("/toast");
    await page.getByRole("button", { name: "Saving" }).locator("svg").waitFor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Close" }).locator("svg").waitFor();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    expect((await guest().fetch("/toast")).headers.get("content-security-policy")).toContain("img-src 'self';");
  });

  it("renders and fills the Nuxt UI form controls without a CSP violation", async () => {
    const page = await visit("/form");
    await fillForm(page, { "Accept terms": true, "Notify me": true, Plan: "Pro", Tag: "Green", Role: "Editor", Starts: "2026-03-14" });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  });

  it("renders an icon the page did not preload from the app's own server when the icon request is slow", async () => {
    const page = await visit("/icon");
    const { promise: released, resolve: release } = Promise.withResolvers<void>();

    await page.route("**/api/_nuxt_icon/**", async (route) => {
      await released;
      await route.continue();
    });
    await page.clock.install();
    const requested = page.waitForRequest("**/api/_nuxt_icon/**");
    await page.getByRole("button", { name: "Show rocket" }).click();
    await requested;
    await page.clock.runFor(1000);
    release();
    await page.locator("svg[data-testid=rocket], [data-testid=rocket] svg").waitFor();
  });

  it("keeps the theme colours on a client-only route without a CSP violation", async () => {
    const page = await visit("/client");
    await page.getByRole("button", { name: "Client only" }).waitFor();

    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-color-primary-500"))).not.toBe("");
  });

  it("switches to dark mode without a CSP violation", async () => {
    const page = await visit("/color-mode");
    await page.getByRole("button", { name: "Go dark" }).click();
    await page.locator("html.dark").waitFor();
  });
});
