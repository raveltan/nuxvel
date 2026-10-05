import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished } from "vitest";
import { playgroundBuild } from "./helpers/playground";
import { startSecondServer } from "./helpers/second-server";

async function serverFiles() {
  const serverDir = join(playgroundBuild().outputDir, "server");
  const entries = await readdir(serverDir, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("a nuxt build of the app", () => {
  it("carries no command runner: no NUXVEL_COMMAND and no tinker chunk", async () => {
    const files = await serverFiles();
    const withCommandEnv = [];

    for (const file of files) {
      if ((await readFile(file, "utf8")).includes("NUXVEL_COMMAND")) withCommandEnv.push(file);
    }

    expect(files.length).toBeGreaterThan(0);
    expect(withCommandEnv).toEqual([]);
    expect(files.filter((file) => /tinker/i.test(file))).toEqual([]);
  });

  it("serves requests when started with NUXVEL_COMMAND set, instead of running it and exiting", async () => {
    const outFile = join(await mkdtemp(join(tmpdir(), "nuxvel-command-")), "routes.json");
    const server = await startSecondServer({
      env: { NUXVEL_COMMAND: JSON.stringify({ kind: "routes", outFile }) },
    });

    onTestFinished(() => server.stop());

    const response = await fetch(new URL("/api/health/live", server.url));

    expect(response.status).toBe(200);
    expect(server.child.exitCode).toBeNull();
    expect(existsSync(outFile)).toBe(false);
  }, 30_000);
});
