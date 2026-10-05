import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { findForbiddenSharedImports } from "./shared-database-imports";

describe("arch: no drizzle-orm, schema or server/database imports under shared/", () => {
  it("finds none in the real playground/shared tree", () => {
    expect(findForbiddenSharedImports()).toEqual([]);
  });

  it("flags a file that imports drizzle-orm", () => {
    const dir = mkdtempSync(join(tmpdir(), "nuxvel-arch-"));
    writeFileSync(join(dir, "bad.ts"), 'import { eq } from "drizzle-orm";');

    try {
      expect(findForbiddenSharedImports(dir)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags a file that imports server/database/**", () => {
    const dir = mkdtempSync(join(tmpdir(), "nuxvel-arch-"));
    writeFileSync(
      join(dir, "bad.ts"),
      'import { db } from "../server/database/client";',
    );

    try {
      expect(findForbiddenSharedImports(dir)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.for([
    'import { pgTable } from "drizzle-orm/pg-core";',
    'import { posts } from "#nuxvel/schema";',
    'import { timestamps } from "@nuxvel/nuxt/database";',
  ])("flags %s", (source) => {
    const dir = mkdtempSync(join(tmpdir(), "nuxvel-arch-"));
    writeFileSync(join(dir, "bad.ts"), source);

    try {
      expect(findForbiddenSharedImports(dir)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
