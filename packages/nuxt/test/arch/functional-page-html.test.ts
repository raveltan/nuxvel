import { fileURLToPath } from "node:url";
import typescriptParser from "@typescript-eslint/parser";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import { architecture } from "../../src/eslint";

const REPO_DIR = fileURLToPath(new URL("../../../..", import.meta.url));

const functionalTestsConfig = architecture.find((config) => config.name === "nuxvel/functional-tests");

const SERVER_RENDERED_OUTPUT = [
  "packages/nuxt/test/auth-sessions.test.ts",
  "packages/nuxt/test/console-logging.test.ts",
  "packages/nuxt/test/date-time.test.ts",
  "packages/nuxt/test/dev-scratch-app/shared-schemas-watch.ts",
  "packages/nuxt/test/flags-cached.test.ts",
  "packages/nuxt/test/rendering-presets.test.ts",
  "packages/nuxt/test/safe-html.test.ts",
  "packages/nuxt/test/scratch-app/i18n-one-locale.ts",
  "packages/nuxt/test/scratch-app/pwa.ts",
  "packages/nuxt/test/scratch-app/seo-off.ts",
  "packages/nuxt/test/seo.test.ts",
  "packages/nuxt/test/use-user-cached.test.ts",
];

const eslint = new ESLint({
  cwd: REPO_DIR,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ["**/*.ts"], languageOptions: { parser: typescriptParser } },
    {
      ...functionalTestsConfig,
      files: ["**/*.ts"],
      ignores: ["**/*.nuxt.test.ts", "**/e2e/**", "**/fixtures/**", "**/lint-fixtures/**", "**/type-fixtures/**"],
    },
  ],
});

function pageHtmlFiles(results: ESLint.LintResult[]) {
  return results
    .filter((result) => result.messages.some((message) => message.ruleId === "nuxvel/functional-page-html"))
    .map((result) => result.filePath.slice(REPO_DIR.length));
}

describe("arch: the functional tests of this repo read no page HTML, as an app's tests do", () => {
  it("finds page HTML only in the tests of server-rendered output: the error page, SEO and head tags, SafeHtml and hydration", async () => {
    const results = await eslint.lintFiles([
      "packages/*/test/**/*.ts",
      "packages/create/template/tests/**/*.ts",
      "playground/tests/**/*.ts",
    ]);

    expect(pageHtmlFiles(results).sort()).toEqual(SERVER_RENDERED_OUTPUT);
  }, 60_000);

  it.for([
    ['await guest().$fetch("/posts");', 1],
    ["await guest().$fetch(`/posts/${id}`);", 1],
    ["await guest().$fetch(`/_locales/index/${locale}/data.json`);", 0],
    ['await guest().$fetch<string>("/sitemap.xml");', 0],
    ['await guest().$fetch("/api/health/ready");', 0],
    ['const page = await guest().fetch("/sign-in"); await page.text();', 1],
  ] as const)("counts %s as %i", async ([source, found]) => {
    const results = await eslint.lintText(source, { filePath: "tests/functional/sample.test.ts" });

    expect(results.flatMap((result) => result.messages.filter((message) => message.ruleId === "nuxvel/functional-page-html"))).toHaveLength(found);
  });
});
