import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { listFiles } from "./list-files";

const SRC_DIR = fileURLToPath(new URL("../../src", import.meta.url));

const NAMED_SCHEMA_IMPORT = /(?:import|export)\s+(?:type\s+)?\{[^}]*\}\s*from\s*["']#nuxvel\/schema["']/;

function namedSchemaImports(dir: string = SRC_DIR): string[] {
  return listFiles(dir)
    .filter((path) => /\.(ts|vue)$/.test(path))
    .filter((path) => NAMED_SCHEMA_IMPORT.test(readFileSync(path, "utf8")));
}

describe("arch: the framework finds starter tables by SQL name, not by export name", () => {
  it("finds no named import from #nuxvel/schema in packages/nuxt/src", () => {
    expect(namedSchemaImports()).toEqual([]);
  });

  it.for([
    ['import { auditLog } from "#nuxvel/schema";', 1],
    ['import type { user as users } from "#nuxvel/schema";', 1],
    ['import * as schema from "#nuxvel/schema";', 0],
    ['import type * as schema from "#nuxvel/schema";', 0],
  ] as const)("counts %s as %i", ([source, found]) => {
    const dir = mkdtempSync(join(tmpdir(), "nuxvel-arch-"));
    writeFileSync(join(dir, "file.ts"), source);

    try {
      expect(namedSchemaImports(dir)).toHaveLength(found);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
