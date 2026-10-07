import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("topic entries", () => {
  it("matches the output of the generator", () => {
    execFileSync("node", ["scripts/generate-entries.mjs", "--check"], { cwd: packageDir, stdio: "pipe" });
  });

  it("only re-exports", () => {
    const files = ["server", "app", "shared"].flatMap((side) =>
      readdirSync(join(packageDir, "src", side)).map((file) => join("src", side, file)),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const lines = readFileSync(join(packageDir, file), "utf8").trim().split("\n");
      for (const line of lines) {
        expect(line).toMatch(/^export (type )?(\{[^}]*\}|\*) from "\.\.\/\.\.\/runtime\//);
        expect(line).toMatch(/";$/);
      }
    }
  });
});
