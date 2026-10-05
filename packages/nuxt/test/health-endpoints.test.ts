import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { startServer, stopServer } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

const UNREACHABLE_DATABASE_URL = "postgres://nuxvel:nuxvel@127.0.0.1:1/nuxvel";

describe("health endpoints", async () => {
  await setupPlayground({ env: { NUXT_NUXVEL_HEALTH_MIN_FREE_DISK_PERCENT: "0" } });

  it("reports liveness without touching the database", async () => {
    const response = await guest().fetch("/api/health/live");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "live" });
  });

  it("reports readiness when the database and Redis are reachable", async () => {
    const response = await guest().fetch("/api/health/ready");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      database: "reachable",
      redis: "reachable",
      disk: "ok",
    });
  });

  it("reports degraded readiness, still 200, when free disk space is under the threshold", async () => {
    await stopServer();
    await startServer({ env: { NUXT_NUXVEL_HEALTH_MIN_FREE_DISK_PERCENT: "100" } });

    try {
      const ready = await guest().fetch("/api/health/ready");

      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({
        status: "degraded",
        database: "reachable",
        redis: "reachable",
        disk: "low",
      });
    } finally {
      await stopServer();
      await startServer();
    }
  }, 120000);

  it("reports 503 readiness and 200 liveness when the database is unreachable", async () => {
    await stopServer();
    await startServer({ env: { NUXT_DATABASE_URL: UNREACHABLE_DATABASE_URL } });

    try {
      const ready = await guest().fetch("/api/health/ready");

      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({
        status: "unavailable",
        database: "unreachable",
        redis: "reachable",
        disk: "ok",
      });

      expect((await guest().fetch("/api/health/live")).status).toBe(200);
    } finally {
      await stopServer();
      await startServer();
    }
  }, 120000);
});
