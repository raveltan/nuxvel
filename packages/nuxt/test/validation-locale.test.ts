import { describe, it } from "vitest";
import { expect, guest, text, visit } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

const chinese = "数值过小：期望 string >=3 字符";
const english = "Too small: expected string to have >=3 characters";

describe("validation messages in the locale", async () => {
  await setupPlayground({ browser: true });

  it.for([
    ["zh", chinese],
    ["en", english],
  ] as const)("gives a procedure input and an action input in %s", async ([locale, message]) => {
    const { trpc } = guest({ locale });

    await expect(trpc._localeCheck.validated({ title: "a" })).rejects.toHaveValidationErrors({ title: message });
    await expect(trpc._localeCheck.validatedAction()).rejects.toHaveValidationErrors({ title: message });
  });

  it.for([
    ["zh", chinese],
    ["en", english],
  ] as const)("validates in the browser in %s", async ([locale, message]) => {
    const page = await visit("/_validation-locale", { locale });

    await expect(text(page, `message:${message}`)).toBeVisible();
  });
});
