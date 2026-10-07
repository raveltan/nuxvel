import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const fromApp = createRequire(fileURLToPath(new URL("../../../playground/package.json", import.meta.url)));
const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));

type ExportTarget = string | { types: string; default: string };

describe("@nuxvel/nuxt's exports", () => {
  it("resolve every public entry to dist", () => {
    for (const entry of [
      "@nuxvel/nuxt",
      "@nuxvel/nuxt/cli",
      "@nuxvel/nuxt/database",
      "@nuxvel/nuxt/env",
      "@nuxvel/nuxt/eslint",
      "@nuxvel/nuxt/eslint/architecture",
      "@nuxvel/nuxt/factory-defaults",
      "@nuxvel/nuxt/testing",
      "@nuxvel/nuxt/testing/setup",
      "@nuxvel/nuxt/testing/database",
      "@nuxvel/nuxt/testing/changes-reporter",
      "@nuxvel/nuxt/server/database",
      "@nuxvel/nuxt/app/api",
      "@nuxvel/nuxt/shared/pagination",
    ]) {
      expect(fromApp.resolve(entry)).toMatch(/packages\/nuxt\/dist\/.*\.mjs$/);
    }
  });

  it("point every entry at a module and its types in dist", () => {
    const manifest: { exports: Record<string, ExportTarget> } = JSON.parse(readFileSync(manifestPath, "utf8"));
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));

    for (const [entry, target] of Object.entries(manifest.exports)) {
      if (typeof target === "string") continue;
      if (entry.endsWith("/*")) {
        const side = entry.slice(2, -2);
        for (const file of readdirSync(join(packageRoot, "src", side))) {
          const stem = file.replace(/\.ts$/, "");
          expect(existsSync(join(packageRoot, "dist", side, `${stem}.mjs`)), `${entry}: ${stem}`).toBe(true);
          expect(existsSync(join(packageRoot, "dist", side, `${stem}.d.mts`)), `${entry}: ${stem}`).toBe(true);
        }
        continue;
      }
      for (const file of [target.types, target.default]) {
        expect(file).toMatch(/^\.\/dist\//);
        expect(existsSync(fileURLToPath(new URL(`../${file}`, import.meta.url))), file).toBe(true);
      }
    }
  });

  it("keep the factories and the deprecated names out of the testing entry", async () => {
    const testing = await import("@nuxvel/nuxt/testing");

    for (const name of ["defineFactory", "sequence", "dispatch", "events", "emitEvent"]) {
      expect(testing, name).not.toHaveProperty(name);
    }
  });

  it("refuse a deep import into the runtime", () => {
    expect(() => fromApp.resolve("@nuxvel/nuxt/dist/runtime/server/trpc/trpc")).toThrow(
      /is not defined by "exports"/,
    );
  });
});
