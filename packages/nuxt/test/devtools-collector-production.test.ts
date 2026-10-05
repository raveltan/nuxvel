import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { playgroundBuild, setupPlayground } from "./helpers/playground";

describe("the dev collector outside development", async () => {
  await setupPlayground();

  it("subscribes to nothing; only the test recorders listen", async () => {
    await guest().$fetch("/api/_collector-check");

    expect(await guest().$fetch("/api/_observed-channels-check")).toEqual({
      "db:query": false,
      "trpc:call": false,
      "action:call": true,
      "policy:decision": true,
      "flag:evaluation": false,
      "job:dispatch": true,
      "event:emit": true,
      "listener:run": true,
      "mail:send": true,
      "notification:send": true,
      "realtime:broadcast": true,
      "rate-limit:hit": false,
      "cache:lookup": true,
      log: true,
      error: true,
      run: false,
    });
  });

  function serverBundle() {
    const serverDir = join(playgroundBuild().outputDir, "server");

    return globSync("**/*.mjs", { cwd: serverDir }).map((file) => readFileSync(join(serverDir, file), "utf8"));
  }

  it("is not in the server bundle", () => {
    const bundled = serverBundle();

    expect(bundled.length).toBeGreaterThan(0);
    expect(bundled.some((code) => code.includes("nuxvel:devtools:entries"))).toBe(false);
  });

  it("leaves the database client unwrapped and bundles no dev N+1 warning", () => {
    const bundled = serverBundle();

    expect(bundled.some((code) => code.includes("repeatReason"))).toBe(false);
    expect(bundled.some((code) => code.includes("N+1 suspected"))).toBe(false);
  });

  it("has no collected entries to read", async () => {
    expect((await guest().fetch("/_nuxvel/test/collected")).status).toBe(404);
  });
});
