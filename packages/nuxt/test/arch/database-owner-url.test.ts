import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { findDatabaseOwnerUrlReferences } from "./database-owner-url";

describe("arch: no DATABASE_OWNER_URL under runtime/server", () => {
  it("finds none in the real runtime/server tree", () => {
    expect(findDatabaseOwnerUrlReferences()).toEqual([]);
  });

  it("flags a file that does reference it", () => {
    const dir = mkdtempSync(join(tmpdir(), "nuxvel-arch-"));
    writeFileSync(
      join(dir, "bad.ts"),
      "const url = process.env.NUXT_DATABASE_OWNER_URL;",
    );

    try {
      expect(findDatabaseOwnerUrlReferences(dir)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
