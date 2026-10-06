import { fileURLToPath } from "node:url";
import typescriptParser from "@typescript-eslint/parser";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import vueParser from "vue-eslint-parser";
import { architecture } from "../../src/eslint";

const REPO_DIR = fileURLToPath(new URL("../../../..", import.meta.url));

const importsConfig = architecture.find((config) => config.name === "nuxvel/imports");

const eslint = new ESLint({
  cwd: REPO_DIR,
  overrideConfigFile: true,
  errorOnUnmatchedPattern: false,
  overrideConfig: [
    { files: ["**/*.ts"], languageOptions: { parser: typescriptParser } },
    { files: ["**/*.vue"], languageOptions: { parser: vueParser, parserOptions: { parser: typescriptParser } } },
    { ...importsConfig, files: ["**/*.ts", "**/*.vue"], ignores: ["**/*.d.ts"] },
  ],
});

function parentImportFindings(results: ESLint.LintResult[]) {
  return results.flatMap((result) =>
    result.messages.filter((message) => message.ruleId === "nuxvel/no-parent-imports").map((message) => `${result.filePath}:${message.line}`),
  );
}

describe("arch: the playground and the template import through the aliases, as an app does", () => {
  it("finds no ../ import into another kind folder in the playground and the template", async () => {
    const results = await eslint.lintFiles(
      ["playground", "packages/create/template"].flatMap((app) =>
        ["server", "app", "shared", "tests"].flatMap((root) => [`${app}/${root}/**/*.ts`, `${app}/${root}/**/*.vue`]),
      ),
    );

    expect(parentImportFindings(results)).toEqual([]);
  }, 60_000);

  it.for([
    ['import { userTable } from "../database/schema/auth.schema";', "server/policies/post.policy.ts", 1],
    ['import { userTable } from "#nuxvel/schema";', "server/policies/post.policy.ts", 0],
    ['import { slug } from "./slug";', "server/utils/report.ts", 0],
    ['<script setup lang="ts">\nimport { slug } from "../../server/utils/slug";\n</script>\n', "app/pages/report.vue", 1],
  ] as const)("counts %s in %s as %i", async ([source, filePath, found]) => {
    expect(parentImportFindings(await eslint.lintText(source, { filePath }))).toHaveLength(found);
  });
});
