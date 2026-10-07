import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packNuxvel } from "@nuxvel/test-helpers/pack-nuxvel";
import { run } from "@nuxvel/test-helpers/run";

describe("the packed @nuxvel/nuxt", () => {
  it("declares each subpath without loading the runtime files of the other subpaths", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-declarations-"));

    try {
      const { vendorDir, nuxt } = await packNuxvel(scratchDir);
      const unpacked = await run("tar", ["xzf", join(vendorDir, nuxt)], scratchDir);
      expect(unpacked.exitCode, unpacked.output).toBe(0);

      const dist = join(scratchDir, "package", "dist");
      const entries = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter(
        (file) => file.endsWith(".d.mts") && !file.startsWith("runtime"),
      );
      const sideEffectImports = entries.flatMap((file) =>
        [...readFileSync(join(dist, file), "utf8").matchAll(/^import '[^']*\/runtime\/[^']*';$/gm)].map(([line]) => `${file}: ${line}`),
      );

      expect(entries).toContain("database.d.mts");
      expect(sideEffectImports).toEqual([]);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }, 600_000);
});
