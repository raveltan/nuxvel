import { fileURLToPath } from "node:url";
import typescriptParser from "@typescript-eslint/parser";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import { architecture } from "../../src/eslint";

const TEST_DIR = fileURLToPath(new URL("..", import.meta.url));

const testsConfig = architecture.find((config) => config.name === "nuxvel/tests");

const eslint = new ESLint({
  cwd: TEST_DIR,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ["**/*.ts"], languageOptions: { parser: typescriptParser } },
    { ...testsConfig, files: ["**/*.ts"], ignores: ["lint-fixtures/**", "type-fixtures/**", "**/*.nuxt.test.ts"] },
  ],
});

function restrictedExpectImports(results: ESLint.LintResult[]) {
  return results.flatMap((result) =>
    result.messages.filter((message) => message.ruleId === "no-restricted-imports").map((message) => `${result.filePath}:${message.line}`),
  );
}

describe("arch: the framework tests take expect from @nuxvel/nuxt/testing, as an app's tests do", () => {
  it("finds no expect from vitest or playwright in packages/nuxt/test", async () => {
    expect(restrictedExpectImports(await eslint.lintFiles(["**/*.ts"]))).toEqual([]);
  });

  it.for([
    ['import { describe, expect, it } from "vitest";', 1],
    ['import { expect } from "@playwright/test";', 1],
    ['import { describe, it } from "vitest";', 0],
    ['import { expect } from "@nuxvel/nuxt/testing";', 0],
    ['import { describe, it } from "@nuxvel/nuxt/testing";', 0],
  ] as const)("counts %s as %i", async ([source, found]) => {
    expect(restrictedExpectImports(await eslint.lintText(source, { filePath: "sample.test.ts" }))).toHaveLength(found);
  });
});
