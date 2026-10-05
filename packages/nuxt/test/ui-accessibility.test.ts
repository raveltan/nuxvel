import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { expect, expectAccessible, visit } from "@nuxvel/nuxt/testing";
import { setupApp } from "./helpers/playground";

describe("Nuxt UI defaults are accessible without app CSS", async () => {
  await setupApp({
    rootDir: fileURLToPath(new URL("../../../playground", import.meta.url)),
    browser: true,
    nuxtConfig: {
      srcDir: fileURLToPath(new URL("./fixtures/ui-app", import.meta.url)),
    },
  });

  it("passes WCAG AA with a primary button, an error alert and every <QueryState> state", async () => {
    const page = await visit("/");

    await page.getByText("First post").waitFor();
    await page.getByText("The list could not be loaded.").waitFor();
    await page.getByText("Nothing here yet.").waitFor();
    expect(await page.getByRole("status").textContent()).toBe("Loading…");
    await expectAccessible(page);
  });

  it("passes WCAG AA while a toast is open", async () => {
    const page = await visit("/toast");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByText("Post saved", { exact: true }).waitFor();
    await page.mouse.move(0, 0);
    await expectAccessible(page);
  });
});
