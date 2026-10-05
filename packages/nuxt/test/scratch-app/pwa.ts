import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../../playground/server/factories/users.factory";

export const PWA_OPTIONS = {
  name: "Acme Blog",
  shortName: "Blog",
  themeColor: "#0f172a",
  icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
};

export function addPwaPages(appDir: string) {
  mkdirSync(join(appDir, "app/pages"), { recursive: true });
  writeFileSync(
    join(appDir, "app/pages/account.vue"),
    '<script setup lang="ts">\ndefinePageMeta({ middleware: "auth" });\n</script>\n\n<template><h1>Account</h1></template>\n',
  );
}

describe("an app with nuxvel.pwa", () => {
  it("links the web app manifest built from the option", async () => {
    const html = await guest().$fetch<string>("/");
    const manifest = await guest().$fetch<Record<string, unknown>>("/manifest.webmanifest");

    expect(html).toMatch(/<link[^>]* rel="manifest" href="\/manifest.webmanifest">/);
    expect(html).toContain('<meta name="theme-color" content="#0f172a">');
    expect(manifest).toMatchObject({
      name: "Acme Blog",
      short_name: "Blog",
      theme_color: "#0f172a",
      start_url: "/",
      display: "standalone",
      icons: PWA_OPTIONS.icons,
    });
  });

  it("marks a page behind the auth middleware private, so the service worker never stores it", async () => {
    const response = await actingAs(await userFactory({ email: "pwa-account@example.com" })).fetch("/account");

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("registers the service worker, which serves the offline page and cached assets without a network, never an API answer", async () => {
    const page = await createPage();
    const context = page.context();

    await page.goto(url("/"), { waitUntil: "hydration" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto(url("/"), { waitUntil: "hydration" });
    const script = await page.evaluate(() => {
      if (!navigator.serviceWorker.controller) throw new Error("the page has no controlling service worker");
      const src = document.querySelector<HTMLScriptElement>("script[src*='/_nuxt/']")?.src;
      if (!src) throw new Error("the page loads no /_nuxt/ script");
      return src;
    });

    const status = (path: string) =>
      page.evaluate((target) => window.fetch(target).then((response) => response.status, () => "failed"), path);
    await status("/api/health/live");
    await status("/api/auth/get-session");

    await context.setOffline(true);
    await page.goto(url("/posts/never-visited"));

    expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe("You are offline");
    expect(await status(script)).toBe(200);
    expect(await status("/api/health/live")).toBe("failed");
    expect(await status("/api/auth/get-session")).toBe("failed");

    await context.setOffline(false);
    await page.close();
  });
});
