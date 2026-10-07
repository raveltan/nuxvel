import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const componentsDir = fileURLToPath(new URL("../src/runtime/app/components", import.meta.url));

describe("the scanned components directory", () => {
  it("holds only component files", () => {
    const scanned = readdirSync(componentsDir).filter((file) => !file.endsWith(".vue") && !file.includes(".stories."));
    expect(scanned, "files the component scan reads as components").toEqual([]);
  });
});
