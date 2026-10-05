import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const testingEntry = fileURLToPath(new URL("../src/testing/index.ts", import.meta.url));
const testingDoc = fileURLToPath(new URL("../../../docs/testing.md", import.meta.url));

function exportedValues() {
  return [...readFileSync(testingEntry, "utf8").matchAll(/^export \{([^}]+)\}/gm)]
    .flatMap(([, names = ""]) => names.split(","))
    .map((name) => name.trim())
    .filter((name) => name !== "" && !name.startsWith("type "));
}

function documentedFixtures() {
  const [, reference = ""] = readFileSync(testingDoc, "utf8").split("## Fixture reference");
  const table = reference.split("\n## ")[0] ?? "";

  return table
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .flatMap((line) => [...(line.split(" | ")[0] ?? "").matchAll(/`(\w+)\b(?!\.)/g)].map(([, name = ""]) => name));
}

describe("docs/testing.md fixture reference", () => {
  it("lists every value that @nuxvel/nuxt/testing exports, and nothing else", () => {
    expect([...new Set(documentedFixtures())].sort()).toEqual([...exportedValues()].sort());
  });
});
