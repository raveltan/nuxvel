import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { ESLint } from "eslint";
import { describe, it } from "vitest";
import accessibility from "../src/eslint";

const playgroundDir = fileURLToPath(
  new URL("../../../playground", import.meta.url),
);

describe("accessibility lint preset", () => {
  it("flags a form control without a label", async () => {
    const eslint = new ESLint({
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      overrideConfigFile: true,
      overrideConfig: accessibility,
    });

    const [result] = await eslint.lintFiles([
      "test/lint-fixtures/missing-label.vue",
    ]);

    expect(result?.messages.map((message) => message.ruleId)).toContain(
      "vuejs-accessibility/form-control-has-label",
    );
    expect(result?.errorCount).toBeGreaterThan(0);
  });

  it("passes the playground app through its own lint config", async () => {
    const eslint = new ESLint({ cwd: playgroundDir });

    const results = await eslint.lintFiles(["app"]);

    expect(
      results.some((result) => result.filePath.endsWith("layouts/default.vue")),
    ).toBe(true);
    expect(results.flatMap((result) => result.messages)).toEqual([]);
  });
});
