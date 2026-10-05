import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const nuxtBin = fileURLToPath(new URL("../../../node_modules/nuxt/bin/nuxt.mjs", import.meta.url));
const appDir = scratchAppDir("serverless-preset");

async function prepare(preset: string) {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [nuxtBin, "prepare"], {
    cwd: appDir,
    env: { ...process.env, NO_COLOR: "1", NITRO_PRESET: preset },
  });

  return `${stdout}${stderr}`;
}

describe("a serverless Nitro preset in an app with jobs and channels", () => {
  beforeAll(() => {
    createScratchApp(appDir);
    mkdirSync(join(appDir, "server/jobs"), { recursive: true });
    mkdirSync(join(appDir, "server/channels"), { recursive: true });
    writeFileSync(
      join(appDir, "server/jobs/notify.ts"),
      'import { z } from "zod";\n\nexport default defineJob({ input: z.object({}), handler: async () => {} });\n',
    );
    writeFileSync(
      join(appDir, "server/channels/posts.ts"),
      "export default defineChannel({ events: {}, authorize: () => true });\n",
    );
  });
  afterAll(() => removeScratchApp(appDir));

  it("warns that the preset cannot run the worker or hold the streams", async () => {
    expect(await prepare("vercel")).toContain(
      'the "vercel" preset runs the server as serverless functions, but jobs need a long-running nuxvel queue:work worker, and channels hold server-sent event streams open longer than a function runs.',
    );
  }, 60_000);

  it("stays quiet with a server preset", async () => {
    expect(await prepare("node-server")).not.toContain("serverless functions");
  }, 60_000);
});
