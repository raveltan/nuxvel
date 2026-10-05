import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
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
});
