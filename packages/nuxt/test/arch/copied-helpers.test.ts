import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { type CopiedHelperRule, findCopiedHelpers, RULES } from "./copied-helpers";

function findingsFor(rule: CopiedHelperRule, file: string) {
  const dir = mkdtempSync(join(tmpdir(), "nuxvel-arch-"));
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), rule.sample);

  try {
    return findCopiedHelpers([{ ...rule, dir }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("arch: the framework source uses its shared helpers instead of copies", () => {
  it("finds none in the framework source", () => {
    expect(findCopiedHelpers()).toEqual([]);
  });

  it.for(RULES)("flags $use", (rule) => {
    expect(findingsFor(rule, "bad.ts")).toHaveLength(1);
  });

  it.for(RULES)("allows $use in its home", (rule) => {
    expect(findingsFor(rule, rule.home)).toEqual([]);
  });
});
