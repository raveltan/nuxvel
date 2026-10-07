import { describe, it } from "vitest";
import { actingAs, expect, guest, text, visit } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("currentLocale()", async () => {
  await setupPlayground({ browser: true });

  it("gives the locale of the test caller to the context, the procedure and its action", async () => {
    expect(await guest({ locale: "zh" }).api._localeCheck.current()).toEqual({ context: "zh", request: "zh", action: "zh", inAction: "zh" });
    expect(await guest().api._localeCheck.current()).toEqual({ context: "en", request: "en", action: "en", inAction: "en" });
  });

  it("gives an action the locale of its context", async () => {
    expect(await guest().api._localeCheck.given()).toEqual({ action: "zh", inAction: "zh" });
  });

  it.for([
    [{ "accept-language": "zh-CN,en;q=0.5" }, undefined, "zh"],
    [{ "accept-language": "fr" }, undefined, "en"],
    [{ cookie: "user-locale=zh", "accept-language": "en" }, undefined, "zh"],
    [{ cookie: "user-locale=zh" }, "en", "en"],
  ] as const)("reads %o with the locale option %s as %s", async ([headers, locale, expected]) => {
    const { api } = actingAs(await userFactory(), { headers, ...(locale ? { locale } : {}) });

    expect((await api._localeCheck.current()).context).toBe(expected);
  });

  it("gives a procedure the locale of the page that calls it", async () => {
    const page = await visit("/_request-locale", { locale: "zh" });

    expect(page.url()).toMatch(/\/zh\/_request-locale$/);
    await expect(text(page, "rendered:zh")).toBeVisible();
    await expect(text(page, "browser:zh")).toBeVisible();

    const english = await visit("/_request-locale", { extraHTTPHeaders: { "accept-language": "zh" } });

    await expect(text(english, "rendered:en")).toBeVisible();
    await expect(text(english, "browser:en")).toBeVisible();
  });
});
