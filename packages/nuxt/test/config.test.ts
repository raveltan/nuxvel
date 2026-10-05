import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("useNuxvelConfig", async () => {
  await setupPlayground();

  it("returns the runtime part of the nuxvel block of nuxt.config", async () => {
    const body = await guest().$fetch("/api/_nuxvel-config-check");
    expect(body).toEqual({
      mail: { from: "nuxvel playground <hello@nuxvel.test>" },
      audit: { retentionMonths: 24 },
      experiments: { requireConsent: false },
      database: {},
      queue: {},
      realtime: { maxConnections: 20 },
      siteName: "",
      security: { trustProxy: false },
      health: { minFreeDiskPercent: 15 },
      billing: true,
      api: { restPrefix: "/api/v1", openapi: { title: "nuxvel playground", version: "1.0.0" } },
    });
  });
});
