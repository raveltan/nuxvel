import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { typeFilesImportingSource } from "../helpers/editor-types";

export function useEditorTypes(appDir: string) {
  const typesDir = join(appDir, ".types");
  mkdirSync(typesDir, { recursive: true });
  process.env.NUXVEL_EDITOR_TYPES_DIR = typesDir;
}

describe("the dev server of a linked app when the framework declarations are built", () => {
  it("points every generated type file at the declarations, not the framework source", () => {
    const buildDir = join(useTestContext().options.rootDir, ".nuxt");

    expect(typeFilesImportingSource(buildDir)).toEqual([]);
    expect(readFileSync(join(buildDir, "types/imports.d.ts"), "utf8")).toContain("/.types/runtime/");
    expect(readFileSync(join(buildDir, "nuxt.d.ts"), "utf8")).toContain(".types/types.d.mts");
  });
});
