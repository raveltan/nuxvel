import { fileURLToPath } from "node:url";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import accessibility, { architecture } from "../src/eslint";
import { setupPlayground } from "./helpers/playground";

describe("<SafeHtml>", async () => {
  await setupPlayground();

  it("renders sanitized HTML as markup", async () => {
    const html = await guest().$fetch<string>("/_safe-html");

    expect(html).toContain(
      '<section class="safe-html"><div><p>Hello <strong>world</strong></p></div></section>',
    );
  });

  it("is the only way the architecture preset lets a page render an HTML string", async () => {
    const eslint = new ESLint({
      cwd: fileURLToPath(new URL("./lint-fixtures", import.meta.url)),
      overrideConfigFile: true,
      overrideConfig: [...accessibility, ...architecture],
    });

    const [result] = await eslint.lintFiles(["app/raw-v-html.vue"]);

    expect(result?.messages).toEqual([
      expect.objectContaining({
        ruleId: "nuxvel/no-raw-v-html",
        message: "v-html renders HTML that nothing sanitized, use <SafeHtml :html> with sanitizeHtml() output",
      }),
    ]);
  });
});
