import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

type Messages = { nuxvel: { authForm: { signIn: string; email: string } } };

export function addExtraLocales(appDir: string) {
  const configFile = join(appDir, "nuxt.config.ts");
  const config = readFileSync(configFile, "utf8");
  const zhLocale = "{ code: 'zh', iso: 'zh-CN' }";
  if (!config.includes(zhLocale)) throw new Error("the copied nuxt.config.ts has no zh locale to extend");
  writeFileSync(configFile, config.replace(zhLocale, `${zhLocale},\n      { code: 'fr', iso: 'fr-FR' },\n      { code: 'zh-TW', iso: 'zh-TW' }`));
  mkdirSync(join(appDir, "locales"), { recursive: true });
  writeFileSync(join(appDir, "locales/fr.json"), JSON.stringify({ nuxvel: { authForm: { email: "Courriel" } } }));
}

function globalMessages(locale: string) {
  return guest().$fetch<Messages>(`/_locales/index/${locale}/data.json`);
}

describe("an app with a locale that nuxvel has no strings for", () => {
  it("gives the nuxvel keys the English text, and the app file still overrides a key", async () => {
    const { authForm } = (await globalMessages("fr")).nuxvel;

    expect(authForm.signIn).toBe("Sign in");
    expect(authForm.email).toBe("Courriel");
  });

  it("gives a regional locale the strings of its language", async () => {
    expect((await globalMessages("zh-TW")).nuxvel.authForm.signIn).toBe("登录");
  });
});
