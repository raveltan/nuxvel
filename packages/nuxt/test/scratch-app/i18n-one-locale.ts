import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

export function removeI18nConfig(appDir: string) {
  const configFile = join(appDir, "nuxt.config.ts");
  const config = readFileSync(configFile, "utf8");
  const withoutI18n = config.replace(/\n {2}i18n: \{[\s\S]*?\n {2}\},/, "");
  if (withoutI18n === config) throw new Error("the copied nuxt.config.ts has no i18n key to remove");
  writeFileSync(configFile, withoutI18n);
}

describe("an app with no i18n key", () => {
  it("serves its pages with no locale prefix and has no /zh route", async () => {
    expect((await guest().fetch("/smoke-clean")).status).toBe(200);
    expect((await guest().fetch("/zh/smoke-clean")).status).toBe(404);
  });

  it("adds no hreflang link and no og:locale", async () => {
    const html = await guest().$fetch<string>("/smoke-clean");

    expect(html).not.toContain("hreflang");
    expect(html).not.toContain("og:locale");
  });
});
