import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { findUndeclaredImports } from "./declared-dependencies";

function scratchPackage(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "nuxvel-arch-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "@nuxvel/nuxt",
      dependencies: { h3: "*" },
      peerDependencies: { vitest: "*" },
    }),
  );

  for (const [file, source] of Object.entries(files)) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), source);
  }

  return dir;
}

describe("arch: every package the shipped code imports is declared", () => {
  it("finds none undeclared in the real package", () => {
    expect(findUndeclaredImports()).toEqual([]);
  });

  it("accepts dependencies, peers, subpaths, builtins, the package itself and imports in comments", () => {
    const dir = scratchPackage({
      "src/a.ts": [
        'import { defineEventHandler } from "h3";',
        'import { expect } from "vitest";',
        'import { readFileSync } from "node:fs";',
        'import { join } from "path";',
        'import { timestamps } from "@nuxvel/nuxt/database";',
        'import schema from "#nuxvel/schema";',
        'import { local } from "./local";',
        "/**",
        ' * import { devices } from "playwright-core";',
        " */",
        '// import { chromium } from "playwright-core";',
      ].join("\n"),
    });

    try {
      expect(findUndeclaredImports(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.for([
    ["src/module.ts", 'import type { NuxtHooks } from "@nuxt/schema";', "@nuxt/schema"],
    ["src/eslint.ts", 'import type { Linter } from "eslint";', "eslint"],
    ["src/types.ts", 'declare module "nitropack/types" {}', "nitropack"],
    ["src/runtime/app/ui.css", '@import "tailwindcss";', "tailwindcss"],
    ["src/testing/axe.ts", 'const axe = await import("axe-core");', "axe-core"],
  ] as const)("flags %s importing an undeclared %s", ([file, source, name]) => {
    const dir = scratchPackage({ [file]: source });

    try {
      expect(findUndeclaredImports(dir)).toEqual([`${file} ${name}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
