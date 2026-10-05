import { fileURLToPath } from "node:url";
import typescriptParser from "@typescript-eslint/parser";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import { architecture } from "../../src/eslint";

const REPO_DIR = fileURLToPath(new URL("../../../..", import.meta.url));

const testsConfig = architecture.find((config) => config.name === "nuxvel/tests");

const eslint = new ESLint({
  cwd: REPO_DIR,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ["**/*.ts"], languageOptions: { parser: typescriptParser } },
    { ...testsConfig, files: ["**/*.ts"], ignores: ["**/lint-fixtures/**", "**/type-fixtures/**"] },
  ],
});

function testEachFindings(results: ESLint.LintResult[]) {
  return results.flatMap((result) =>
    result.messages.filter((message) => message.ruleId === "nuxvel/test-each").map((message) => `${result.filePath}:${message.line}`),
  );
}

describe("arch: the tests of this repo use it.for for cases, as an app's tests do", () => {
  it("finds no it.each and no it() in a loop in the tests of the packages, the template and the playground", async () => {
    const results = await eslint.lintFiles([
      "packages/*/test/**/*.ts",
      "packages/create/template/tests/**/*.ts",
      "playground/tests/**/*.ts",
    ]);

    expect(testEachFindings(results)).toEqual([]);
  }, 60_000);

  it.for([
    ['it.each([1, 2])("runs %s", () => {});', 1],
    ['test.each([1, 2])("runs %s", () => {});', 1],
    ['describe.each([1, 2])("runs %s", () => {});', 1],
    ['it.concurrent.each([1, 2])("runs %s", () => {});', 1],
    ['for (const n of [1, 2]) it(`runs ${n}`, () => {});', 1],
    ['[1, 2].forEach((n) => test(`runs ${n}`, () => {}));', 1],
    ['for (const n of [1, 2]) describe(`runs ${n}`, () => it("works", () => {}));', 2],
    ['it.for([1, 2])("runs %s", () => {});', 0],
    ['describe.for([1, 2])("runs %s", () => {});', 0],
    ['it("checks each", () => { for (const n of [1, 2]) expect(n).toBeTruthy(); });', 0],
  ] as const)("counts %s as %i", async ([source, found]) => {
    expect(testEachFindings(await eslint.lintText(source, { filePath: "tests/functional/sample.test.ts" }))).toHaveLength(found);
  });
});
