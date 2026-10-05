import { fileURLToPath } from "node:url";
import typescriptParser from "@typescript-eslint/parser";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import { architecture } from "../../src/eslint";

const REPO_DIR = fileURLToPath(new URL("../../../..", import.meta.url));

const testsConfig = architecture.find((config) => config.name === "nuxvel/tests");

const AUTH_FLOW_TESTS = ["packages/nuxt/test/auth-*.test.ts", "packages/nuxt/test/helpers/auth-flows.ts"];

const eslint = new ESLint({
  cwd: REPO_DIR,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ["**/*.ts"], languageOptions: { parser: typescriptParser } },
    { ...testsConfig, files: ["**/*.ts"], ignores: ["**/fixtures/**", "**/lint-fixtures/**", "**/type-fixtures/**", ...AUTH_FLOW_TESTS] },
  ],
});

function testAuthFindings(results: ESLint.LintResult[]) {
  return results.flatMap((result) =>
    result.messages.filter((message) => message.ruleId === "nuxvel/test-auth").map((message) => `${result.filePath}:${message.line}`),
  );
}

describe("arch: the tests of this repo get their users from factories, as an app's tests do", () => {
  it("finds no sign-up or sign-in over HTTP outside a test in the tests of the packages, the template and the playground", async () => {
    const results = await eslint.lintFiles([
      "packages/*/test/**/*.ts",
      "packages/create/template/tests/**/*.ts",
      "playground/tests/**/*.ts",
    ]);

    expect(testAuthFindings(results)).toEqual([]);
  }, 60_000);

  it.for([
    ['export const signUp = (email: string) => fetch("/api/auth/sign-up/email", { method: "POST", body: email });', 1],
    ['export async function session() { return $fetch("/api/auth/sign-in/email", { method: "POST" }); }', 1],
    ['beforeEach(() => fetch(new URL("/api/auth/sign-up/email", serverUrl)));', 1],
    ["export const signIn = (base: string) => fetch(`/api/auth/sign-in/email?callback=${base}`);", 1],
    ["export const signUp = (origin: string) => fetch(`${origin}/api/auth/sign-up/email`);", 1],
    ['it("signs a new user up", () => fetch("/api/auth/sign-up/email", { method: "POST" }));', 0],
    ['it.for([1])("signs in %s", () => guest().fetch("/api/auth/sign-in/email", { method: "POST" }));', 0],
    ['test("signs up twice", async () => { const twice = () => fetch("/api/auth/sign-up/email"); await twice(); });', 0],
    ['export const reset = () => fetch("/api/auth/request-password-reset", { method: "POST" });', 0],
  ] as const)("counts %s as %i", async ([source, found]) => {
    expect(testAuthFindings(await eslint.lintText(source, { filePath: "tests/functional/sample.test.ts" }))).toHaveLength(found);
  });
});
