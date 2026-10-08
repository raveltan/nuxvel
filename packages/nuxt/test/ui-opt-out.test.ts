import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, guest, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { url, useTestContext } from "@nuxt/test-utils/e2e";
import { setupApp, withoutPlaygroundImgSrc } from "./helpers/playground";

const flashed = encodeURIComponent(JSON.stringify([{ message: "Post created", type: "info" }]));

describe("Nuxt UI opted out with ui: false", async () => {
  await setupApp({
    rootDir: fileURLToPath(new URL("../../../playground", import.meta.url)),
    browser: true,
    nuxtConfig: {
      srcDir: fileURLToPath(new URL("./fixtures/no-ui-app", import.meta.url)),
      nuxvel: { ui: false },
      hooks: withoutPlaygroundImgSrc,
    },
  });

  it("builds and serves pages without Nuxt UI registered", async () => {
    const page = await visit("/");

    await expect(page.locator("#__nuxt")).not.toHaveClass(/\bisolate\b/);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-primary"))).toBe("");
  });

  it("auto-imports no nuxvel name", () => {
    const buildDir = useTestContext().nuxt?.options.buildDir ?? "";
    const imports = readFileSync(join(buildDir, "imports.d.ts"), "utf8");

    expect(imports).not.toMatch(/\buse(Flash|Confirm)\b/);
  });

  it.for(["toast", "confirm"])("fails the page that passes the %s option to a mutation", async (option) => {
    const response = await guest().fetch(`/${option}`);

    expect(response.status).toBe(500);
  });

  it("registers the plain-markup <QueryState>", async () => {
    const page = await visit("/");

    await expect(page.locator('p[role="status"]')).toHaveText("Loading…");
  });

  it("deletes the flash cookie once it hands it to useFlash()", async () => {
    const response = await guest().fetch("/flash", { headers: { cookie: `nuxvel-flash=${flashed}` } });

    expect(response.headers.getSetCookie()).toContainEqual(expect.stringMatching(/^nuxvel-flash=;.*Max-Age=0/));
  });

  it("shows the flash of the cookie through useFlash()", async () => {
    const cookie = { name: "nuxvel-flash", value: flashed, domain: new URL(url("/")).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const };
    const page = await visit("/flash", { storageState: { cookies: [cookie], origins: [] } });

    await expect(page.locator('p[role="status"]')).toHaveText("info: Post created");
  });

  it("leaves the flash cookie for the next page when a script fetches a page", async () => {
    const response = await guest().fetch("/flash", { headers: { cookie: `nuxvel-flash=${flashed}`, "sec-fetch-dest": "empty" } });

    expect(response.headers.getSetCookie()).not.toContainEqual(expect.stringMatching(/^nuxvel-flash=/));
  });

  it("keeps the strict img-src and adds no style-src-attr", async () => {
    const response = await guest().fetch("/");
    const policy = response.headers.get("content-security-policy");

    expect(policy).toContain("img-src 'self';");
    expect(policy).not.toContain("style-src-attr");
  });
});
