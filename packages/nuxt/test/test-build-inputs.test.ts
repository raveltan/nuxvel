import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { testBuildInputs } from "../src/testing/test-build";

function appWithCopiedLocalPackage() {
  const appDir = mkdtempSync(join(tmpdir(), "nuxvel-local-package-"));
  const copyDir = join(appDir, "node_modules", "local-package");
  mkdirSync(copyDir, { recursive: true });
  writeFileSync(join(appDir, "package.json"), JSON.stringify({ dependencies: { "local-package": "file:../local-package" } }));
  writeFileSync(join(copyDir, "package.json"), JSON.stringify({ name: "local-package", version: "1.0.0" }));
  writeFileSync(join(copyDir, "index.mjs"), "export default 1;\n");

  return { appDir, copyDir };
}

describe("the inputs of an app's test build", () => {
  it("hash the files of a file: dependency that npm installed as a copy, so a new copy of the same version rebuilds", async () => {
    const { appDir, copyDir } = appWithCopiedLocalPackage();
    const before = await testBuildInputs(appDir, { dotenv: false });

    writeFileSync(join(copyDir, "index.mjs"), "export default 2;\n");
    const after = await testBuildInputs(appDir, { dotenv: false });

    expect(before["local-package/index.mjs"]).toBeDefined();
    expect(after["local-package/index.mjs"]).not.toBe(before["local-package/index.mjs"]);
  });
});
