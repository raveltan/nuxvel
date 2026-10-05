import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const LOCKFILE = fileURLToPath(new URL("../../../../package-lock.json", import.meta.url));

describe("arch: one @nuxt/devtools-kit in the tree", () => {
  it("installs it once, so DevTools and the module share its types and hooks", () => {
    const lock: { packages: Record<string, { version?: string }> } = JSON.parse(readFileSync(LOCKFILE, "utf8"));
    const copies = Object.keys(lock.packages).filter((path) => path.endsWith("node_modules/@nuxt/devtools-kit"));

    expect(copies).toEqual(["node_modules/@nuxt/devtools-kit"]);
  });
});
