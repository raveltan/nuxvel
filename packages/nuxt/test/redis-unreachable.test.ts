import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { freePort } from "@nuxvel/test-helpers/free-port";
import { startSecondServer } from "./helpers/second-server";

describe("the server with Redis unreachable", () => {
  let server: Awaited<ReturnType<typeof startSecondServer>>;

  beforeAll(async () => {
    server = await startSecondServer({
      env: { NUXT_REDIS_URL: `redis://127.0.0.1:${await freePort()}/0` },
    });
  }, 40_000);

  afterAll(() => server.stop());

  function get(path: string) {
    return fetch(new URL(path, server.url), { signal: AbortSignal.timeout(5_000) });
  }

  it("renders pages with the default flag values", async () => {
    expect((await get("/")).status).toBe(200);

    const flags = await get("/_flags");

    expect(flags.status).toBe(200);
    expect(await flags.text()).toContain("probe-rollout:false probe-cta:control");
  });

  it("answers /api/flags with the defaults", async () => {
    const response = await get("/api/flags");

    expect(await response.json()).toMatchObject({
      flags: { "probe-rollout": false },
      experiments: { "probe-cta": "control" },
    });
  });

  it("reports not ready", async () => {
    const response = await get("/api/health/ready");

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "unavailable",
      database: "reachable",
      redis: "unreachable",
    });
  });
});
