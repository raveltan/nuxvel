import { fileURLToPath } from "node:url";
import typescriptParser from "@typescript-eslint/parser";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import { architecture } from "../../src/eslint";

const REPO_DIR = fileURLToPath(new URL("../../../..", import.meta.url));

const sharedConfig = architecture.find((config) => config.name === "nuxvel/shared");

const eslint = new ESLint({
  cwd: REPO_DIR,
  overrideConfigFile: true,
  errorOnUnmatchedPattern: false,
  overrideConfig: [{ files: ["**/*.ts"], languageOptions: { parser: typescriptParser } }, { ...sharedConfig, files: ["**/*.ts"] }],
});

function findings(results: ESLint.LintResult[]) {
  return results.flatMap((result) =>
    result.messages.filter((message) => message.ruleId === "nuxvel/shared-imports").map((message) => `${result.filePath}:${message.line}`),
  );
}

describe("arch: shared/ imports no server code", () => {
  it("applies to shared/ of the app and of a module in layers/", () => {
    expect(sharedConfig?.files).toEqual(["shared/**/*.ts", "layers/*/shared/**/*.ts"]);
  });

  it("finds no server import under shared/ in the playground and the template", async () => {
    const results = await eslint.lintFiles(["playground/shared/**/*.ts", "packages/create/template/shared/**/*.ts"]);

    expect(findings(results)).toEqual([]);
  });

  it.for([
    ['import { postsTable } from "#nuxvel/schema";', 1],
    ['import { slug } from "#server/utils/slug";', 1],
    ['import { slug } from "../../server/utils/slug";', 1],
    ['import { slug } from "~~/server/utils/slug";', 1],
    ['import { eq } from "drizzle-orm";', 1],
    ['import { pgTable } from "drizzle-orm/pg-core";', 1],
    ['export * from "#nuxvel/factories";', 1],
    ['import { z } from "zod";', 0],
    ['import { postInput } from "./post";', 0],
    ['import { money } from "#shared/utils/money";', 0],
  ] as const)("counts %s in shared/schemas/report.ts as %i", async ([source, found]) => {
    expect(findings(await eslint.lintText(source, { filePath: "shared/schemas/report.ts" }))).toHaveLength(found);
  });
});
