import { describe, it } from "vitest";
import { actingAs, button, expect, expectAccessible, menuitem, visit } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

const FADING_TEXT = `<!doctype html>
<html lang="en">
  <head>
    <title>Fade</title>
    <style>
      @keyframes fade { from { color: #ddd } to { color: #000 } }
      .fade { animation: fade 1500ms forwards }
      @keyframes spin { to { transform: rotate(360deg) } }
      .spin { display: inline-block; width: 1em; height: 1em; animation: spin 1s linear infinite }
    </style>
  </head>
  <body><main><h1>Fixture</h1><p class="fade">Fading text</p><span class="spin" aria-hidden="true"></span></main></body>
</html>`;

const UNLABELED_INPUT = `<!doctype html>
<html lang="en">
  <head><title>Unlabeled input</title></head>
  <body><main><h1>Fixture</h1><input type="text"></main></body>
</html>`;

describe("expectAccessible()", async () => {
  await setupPlayground({
    browser: true,
  });

  describe("on a page with an unlabeled input", () => {
    it("fails with the rule, the element and a link to the fix", async () => {
      const page = await visit("/");
      await page.setContent(UNLABELED_INPUT);

      const failure = expectAccessible(page);

      await expect(failure).rejects.toThrow(/^label: Form elements must have labels$/m);
      await expect(failure).rejects.toThrow(/^ {4}input$/m);
      await expect(failure).rejects.toThrow(/fix: https:\/\/dequeuniversity\.com\/rules\/axe\/[\d.]+\/label/);
    });

    it("passes once the rule is disabled with a reason", async () => {
      const page = await visit("/");
      await page.setContent(UNLABELED_INPUT);

      await expectAccessible(page, {
        disable: { label: "a third-party widget renders this input" },
      });
    });

    it("refuses to disable a rule without a reason", async () => {
      const page = await visit("/");
      await page.setContent(UNLABELED_INPUT);

      await expect(expectAccessible(page, { disable: { label: " " } })).rejects.toThrow(
        "give a reason for disabling label",
      );
    });
  });

  it("waits for a fade to finish before it checks the contrast", async () => {
    const page = await visit("/", { bypassCSP: true });
    await page.setContent(FADING_TEXT);

    await expectAccessible(page);
  });

  it("passes the default layout", async () => {
    const page = await visit("/");

    await expectAccessible(page);
  });

  it("passes the app layout, with its user menu open", async () => {
    const email = "accessible-app-layout@example.com";
    const page = await actingAs(await userFactory({ email })).visit("/protected");

    await expectAccessible(page);

    await button(page, email).click();
    await menuitem(page, "Sign out").waitFor();

    await expectAccessible(page);
  });

  it("passes the auth layout", async () => {
    const page = await visit("/_auth-layout");

    await expectAccessible(page);
  });
});
