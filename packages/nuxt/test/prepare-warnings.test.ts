import { execFile } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { typeFilesImportingSource } from "./helpers/editor-types";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const nuxtBin = fileURLToPath(new URL("../../../node_modules/nuxt/bin/nuxt.mjs", import.meta.url));
const appDir = scratchAppDir("prepare-warnings");

describe("nuxt prepare in an app with no pages", () => {
  beforeAll(() => createScratchApp(appDir));
  afterAll(() => removeScratchApp(appDir));

  it("prints no nuxvel warning", async () => {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [nuxtBin, "prepare"], {
      cwd: appDir,
      env: { ...process.env, NO_COLOR: "1" },
    });

    const output = `${stdout}${stderr}`;

    expect(output).toContain("Types generated");
    expect(output).not.toMatch(/warn.*\[nuxvel\]|\[nuxvel\].*warn/i);
  }, 60_000);

  it("keeps the framework source in the types when the declarations for the editor are built", async () => {
    const typesDir = join(appDir, ".types");
    mkdirSync(typesDir, { recursive: true });

    await promisify(execFile)(process.execPath, [nuxtBin, "prepare"], { cwd: appDir, env: { ...process.env, NUXVEL_EDITOR_TYPES_DIR: typesDir } });

    expect(typeFilesImportingSource(join(appDir, ".nuxt"))).toContain("types/plugins.d.ts");
  }, 60_000);

  it("leaves the webworker lib out of the app tsconfig", async () => {
    await promisify(execFile)(process.execPath, [nuxtBin, "prepare"], { cwd: appDir });

    const { compilerOptions } = JSON.parse(readFileSync(join(appDir, ".nuxt/tsconfig.app.json"), "utf8")) as { compilerOptions: { lib: string[] } };

    expect(compilerOptions.lib).toContain("dom");
    expect(compilerOptions.lib.map((lib) => lib.toLowerCase())).not.toContain("webworker");
  }, 60_000);
});
