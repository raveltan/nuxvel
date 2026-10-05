import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { isStub } from "../scripts/ensure-stub.mjs";

describe("pretest stub check", () => {
  it("accepts a stub, refuses a full build and a missing dist", () => {
    const stub = mkdtempSync(join(tmpdir(), "stub-"));
    writeFileSync(join(stub, "module.mjs"), 'import { createJiti } from "jiti";');
    const full = mkdtempSync(join(tmpdir(), "full-"));
    writeFileSync(join(full, "module.mjs"), "export default {};");
    expect(isStub(stub)).toBe(true);
    expect(isStub(full)).toBe(false);
    expect(isStub(join(full, "missing"))).toBe(false);
  });
});
