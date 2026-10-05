import { loadNuxt } from "@nuxt/kit";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished, vi } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { playgroundDir, testBuildDir } from "./helpers/test-builds";

async function testOnlyServerCode(test: boolean) {
  const nuxt = await loadNuxt({
    cwd: playgroundDir,
    ready: true,
    overrides: { test, buildDir: testBuildDir("gating") },
  });

  try {
    return {
      routes: nuxt.options.serverHandlers
        .map((handler) => handler.route ?? "")
        .filter((route) => route.startsWith("/_nuxvel/test")),
      fakes: (nuxt.options.nitro.plugins ?? []).filter((plugin) => plugin.includes("install-fakes")),
    };
  } finally {
    await nuxt.close();
  }
}

describe("the test control channel", () => {
  it("is added with the fakes only when Nuxt builds for tests", async () => {
    const forTests = await testOnlyServerCode(true);
    const forProduction = await testOnlyServerCode(false);

    expect(forTests.routes.length).toBeGreaterThan(0);
    expect(forTests.fakes).toHaveLength(1);
    expect(forProduction).toEqual({ routes: [], fakes: [] });
  }, 60000);

  it("refuses a production build for tests that Vitest did not start", async () => {
    vi.stubEnv("VITEST", undefined);
    onTestFinished(() => vi.unstubAllEnvs());

    await expect(
      loadNuxt({ cwd: playgroundDir, overrides: { test: true, buildDir: testBuildDir("gating") } }),
    ).rejects.toThrow("nuxvel: Nuxt's test option is on in a production build that Vitest did not start");
  }, 60000);
});

describe("the test control channel in a server Vitest did not start", async () => {
  await setupPlayground({ env: { VITEST: "" } });

  it("answers 404", async () => {
    const response = await guest().fetch("/_nuxvel/test/recorded");

    expect(response.status).toBe(404);
  });
});
