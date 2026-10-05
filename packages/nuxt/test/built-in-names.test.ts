import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it, onTestFinished, vi } from "vitest";
import { buildAndClose } from "./helpers/build-nuxt";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

function captureStderr() {
  const chunks: string[] = [];
  const write = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  onTestFinished(() => write.mockRestore());
  return chunks;
}

const appDir = scratchAppDir("built-in-names");
const shadowingChannel = join(appDir, "server/channels/flags.ts");

describe("a user channel at the path of the built-in flags channel", () => {
  beforeAll(() => {
    createScratchApp(appDir);
    mkdirSync(join(appDir, "server/channels"), { recursive: true });
    writeFileSync(shadowingChannel, "export default defineChannel({ events: {}, authorize: () => true });\n");
  });
  afterAll(() => removeScratchApp(appDir));

  it("fails the build, naming the file", async () => {
    const nuxt = await loadNuxt({ cwd: appDir, dev: false, overrides: { buildDir: join(appDir, ".nuxt") } });

    const stderr = captureStderr();
    const message = `nuxvel: ${shadowingChannel} is named "flags", the name of nuxvel's built-in channel; rename it`;

    await expect(buildAndClose(nuxt)).rejects.toThrow(message);
    expect(stderr.join("")).toContain(message);
  }, 120_000);
});

const namesAppDir = scratchAppDir("definition-file-names");
const spacedWebhook = join(namesAppDir, "server/webhooks/a b.ts");

describe("discovered folders holding tests, declarations and a file name with a space", () => {
  beforeAll(() => {
    createScratchApp(namesAppDir);
    mkdirSync(join(namesAppDir, "server/jobs"), { recursive: true });
    mkdirSync(join(namesAppDir, "server/webhooks"), { recursive: true });
    writeFileSync(join(namesAppDir, "server/jobs/Sync.test.ts"), "export {};\n");
    writeFileSync(join(namesAppDir, "server/webhooks/Probe.spec.ts"), "export {};\n");
    writeFileSync(join(namesAppDir, "server/webhooks/Types.d.ts"), "export {};\n");
    writeFileSync(spacedWebhook, "export default {};\n");
  });
  afterAll(() => removeScratchApp(namesAppDir));

  it("skips the tests and declarations, and fails the build at the name with a rename hint", async () => {
    const nuxt = await loadNuxt({ cwd: namesAppDir, dev: false, overrides: { buildDir: join(namesAppDir, ".nuxt") } });

    const stderr = captureStderr();
    const message = `nuxvel: ${spacedWebhook} is named "a b", but a webhook name may only hold a-z, 0-9, ".", "_" and "-"; rename the file so the name is "a-b"`;

    await expect(buildAndClose(nuxt)).rejects.toThrow(message);
    expect(stderr.join("")).toContain(message);
  }, 120_000);
});
