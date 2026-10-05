import { button, expect, heading, text, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("i18n", async () => {
  await setupPlayground({ browser: true });

  it.for([
    ["en", "Hello"],
    ["zh", "你好"],
  ])("renders $t in the locale %s of the route", async ([locale, greeting]) => {
    const page = await visit("/_i18n", { locale });

    await expect(heading(page, greeting)).toBeVisible();
  });

  it("renders the text of the default locale for a key that the locale of the route does not have", async () => {
    const page = await visit("/_i18n", { locale: "zh" });

    await expect(text(page, "Only in English")).toBeVisible();
  });

  it.for([
    ["en", "January 2, 2026", "Close"],
    ["zh", "2026年1月2日", "关闭"],
  ])("renders <DateTime> and the Nuxt UI labels in the locale %s of the route", async ([locale, date, closeLabel]) => {
    const page = await visit("/_i18n-ui", { locale });

    await expect(text(page, date)).toBeVisible();
    await expect(button(page, closeLabel)).toBeVisible();
  });
});
