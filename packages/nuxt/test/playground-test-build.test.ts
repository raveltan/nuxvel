import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import type { BuildInputs } from "../src/build-cache/build-key";
import { cachedBuild } from "../src/build-cache/cached-build";
import { recordEnvReads } from "../src/build-cache/env-reads";
import { playgroundBuild } from "./helpers/playground";
import { playgroundDir } from "./helpers/test-builds";

const FRAMEWORK_FILE = "@nuxvel/nuxt/src/module.ts";
const PROBES_FILE = "../packages/nuxt/test/fixtures/probes/nuxt.config.ts";
const PLAYGROUND_FILE = "server/policies/post.policy.ts";

function runInputs(): BuildInputs {
  return JSON.parse(readFileSync(join(dirname(playgroundBuild().buildDir), "inputs.json"), "utf8"));
}

describe("the playground's test build", () => {
  it("comes from the test build cache, keyed by the framework source, the probes layer and the playground files", () => {
    const cacheDir = realpathSync(join(playgroundDir, "node_modules", ".cache", "nuxvel", "test"));

    expect(dirname(dirname(playgroundBuild().buildDir))).toBe(cacheDir);
    expect(Object.keys(runInputs())).toEqual(expect.arrayContaining([FRAMEWORK_FILE, PROBES_FILE, PLAYGROUND_FILE]));
  });

  it("leaves out the devtools client that npm install builds again, and keeps its source", () => {
    const labels = Object.keys(runInputs());

    expect(labels.filter((label) => label.startsWith("@nuxvel/nuxt/client-dist/"))).toEqual([]);
    expect(labels).toContain("@nuxvel/nuxt/client/nuxt.config.ts");
  });

  it("is used again until a framework or playground file changes", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "nuxvel-playground-build-"));
    const inputs = runInputs();
    const build = (changed: BuildInputs = {}) =>
      cachedBuild({ cacheDir, rootDir: playgroundDir, inputs: { ...inputs, ...changed }, build: async () => [] });
    const outcome = async (changed?: BuildInputs) => {
      const cached = await build(changed);
      await cached?.release();
      return cached && { built: cached.built, reason: cached.reason };
    };

    expect(await outcome()).toEqual({ built: true, reason: "no earlier build" });
    expect(await outcome()).toEqual({ built: false, reason: undefined });
    expect(await outcome({ [FRAMEWORK_FILE]: "edited" })).toEqual({ built: true, reason: `${FRAMEWORK_FILE} changed` });
    expect(await outcome({ [FRAMEWORK_FILE]: "edited", [PLAYGROUND_FILE]: "edited" })).toEqual({
      built: true,
      reason: `${PLAYGROUND_FILE} changed`,
    });
  });

  it("hashes the environment variables the build reads, and not the ones it only copies", () => {
    const hashed = Object.keys(runInputs()).filter((label) => label.startsWith("env "));

    expect(hashed).toEqual(expect.arrayContaining(["env NODE_ENV", "env NUXVEL_DEVTOOLS", "env PLAYGROUND_PROBES_LAYER"]));
    expect(hashed).not.toContain("env PATH");
  });

  it("does not count a copy of the environment as reads when the first variable was read just before it", async () => {
    const [first] = Object.keys(process.env);

    const read = await recordEnvReads(async () => ({ first: process.env[`${first}`], ...process.env }));

    expect(read).toEqual([first]);
  });

  it("lets the build set a variable that is already in the environment", async () => {
    process.env.PROBE_DEBUG = "before";

    try {
      await recordEnvReads(async () => {
        process.env.PROBE_DEBUG = "nuxvel";
      });

      expect(process.env.PROBE_DEBUG).toBe("nuxvel");
    } finally {
      delete process.env.PROBE_DEBUG;
    }
  });

  it("is made again when a variable the build read changes, and not when another variable changes", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "nuxvel-env-build-"));
    const outcome = async (env: Record<string, string>) => {
      Object.assign(process.env, env);
      const cached = await cachedBuild({
        cacheDir,
        rootDir: playgroundDir,
        inputs: runInputs(),
        build: () => recordEnvReads(async () => ({ ...process.env, flag: process.env.PROBE_BUILD_FLAG })),
      });
      await cached?.release();
      return cached && { built: cached.built, reason: cached.reason };
    };

    try {
      expect(await outcome({ PROBE_BUILD_FLAG: "1", PROBE_SESSION_ID: "a" })).toEqual({ built: true, reason: "no earlier build" });
      expect(await outcome({ PROBE_SESSION_ID: "b" })).toEqual({ built: false, reason: undefined });
      expect(await outcome({ PROBE_BUILD_FLAG: "2" })).toEqual({ built: true, reason: "env PROBE_BUILD_FLAG changed" });
      expect(await outcome({ PROBE_BUILD_FLAG: "1", PROBE_SESSION_ID: "c" })).toEqual({ built: false, reason: undefined });
    } finally {
      delete process.env.PROBE_BUILD_FLAG;
      delete process.env.PROBE_SESSION_ID;
    }
  });
});
