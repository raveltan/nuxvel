import { fileURLToPath } from "node:url";
import typescriptParser from "@typescript-eslint/parser";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import { architecture } from "../../src/eslint";

const REPO_DIR = fileURLToPath(new URL("../../../..", import.meta.url));

const testsConfig = architecture.find((config) => config.name === "nuxvel/tests");

const PAGES_VISIT_CANNOT_OPEN = [
  "packages/nuxt/test/acting-as-login.test.ts",
  "packages/nuxt/test/action-form.test.ts",
  "packages/nuxt/test/date-time.test.ts",
  "packages/nuxt/test/demo-posts.test.ts",
  "packages/nuxt/test/demo-presence.test.ts",
  "packages/nuxt/test/demo-realtime.test.ts",
  "packages/nuxt/test/dev-server/browser-problems.ts",
  "packages/nuxt/test/dev-server/dev-http.ts",
  "packages/nuxt/test/devtools-tab-redis-down.test.ts",
  "packages/nuxt/test/error-tracking-client.test.ts",
  "packages/nuxt/test/maintenance.test.ts",
  "packages/nuxt/test/outdated-build.test.ts",
  "packages/nuxt/test/push-client.test.ts",
  "packages/nuxt/test/scratch-app/pwa.ts",
];

const eslint = new ESLint({
  cwd: REPO_DIR,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ["**/*.ts"], languageOptions: { parser: typescriptParser } },
    { ...testsConfig, files: ["**/*.ts"], ignores: ["**/fixtures/**", "**/lint-fixtures/**", "**/type-fixtures/**"] },
  ],
});

function testClientFindings(results: ESLint.LintResult[]) {
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === "nuxvel/test-client")
      .map((message) => ({ file: result.filePath.slice(REPO_DIR.length), message: message.message })),
  );
}

describe("arch: the tests of this repo reach the app with guest(), actingAs() and visit(), as an app's tests do", () => {
  it("finds no $fetch or fetch of @nuxt/test-utils/e2e, and createPage only where visit() cannot open the page", async () => {
    const results = await eslint.lintFiles([
      "packages/*/test/**/*.ts",
      "packages/create/template/tests/**/*.ts",
      "playground/tests/**/*.ts",
    ]);
    const findings = testClientFindings(results);

    expect(findings.filter(({ message }) => !message.startsWith("createPage "))).toEqual([]);
    expect(findings.map(({ file }) => file).sort()).toEqual(PAGES_VISIT_CANNOT_OPEN);
  }, 60_000);

  it.for([
    ['import { $fetch } from "@nuxt/test-utils/e2e";', 1],
    ['import { createPage, fetch, url } from "@nuxt/test-utils/e2e";', 2],
    ['import { $fetch } from "@nuxt/test-utils";', 1],
    ['import { url, setup } from "@nuxt/test-utils/e2e";', 0],
    ['import type { fetch } from "@nuxt/test-utils/e2e";', 0],
    ['import { guest, visit } from "@nuxvel/nuxt/testing";', 0],
  ] as const)("counts %s as %i", async ([source, found]) => {
    const results = await eslint.lintText(source, { filePath: "tests/functional/sample.test.ts" });

    expect(results.flatMap((result) => result.messages.filter((message) => message.ruleId === "nuxvel/test-client"))).toHaveLength(found);
  });
});
