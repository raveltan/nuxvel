import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderTemplate } from "../src/generators/render-template.ts";

const cwd = fileURLToPath(new URL("..", import.meta.url));

describe("renderTemplate", () => {
  it("uses the built-in template when no override is present", () => {
    const fixtureCwd = mkdtempSync(join(cwd, ".nuxvel-test-render-"));

    try {
      const output = renderTemplate("example.txt", { name: "World" }, fixtureCwd);

      expect(output).toBe("Hello, World!\n");
    } finally {
      rmSync(fixtureCwd, { recursive: true, force: true });
    }
  });

  it("uses the override template when present in .nuxvel/templates/", () => {
    const fixtureCwd = mkdtempSync(join(cwd, ".nuxvel-test-render-"));

    try {
      const templatesDir = join(fixtureCwd, ".nuxvel", "templates");
      mkdirSync(templatesDir, { recursive: true });
      writeFileSync(join(templatesDir, "example.txt"), "Overridden for {{name}}.\n");

      const output = renderTemplate("example.txt", { name: "World" }, fixtureCwd);

      expect(output).toBe("Overridden for World.\n");
    } finally {
      rmSync(fixtureCwd, { recursive: true, force: true });
    }
  });
});
