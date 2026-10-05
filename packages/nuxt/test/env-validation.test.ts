import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { getServerLogs, setup, startServer, stopServer } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

describe("boot-time env validation", async () => {
  await setupPlayground();

  it("boots and serves requests with a complete env", async () => {
    const response = await guest().fetch("/");

    expect(response.status).toBe(200);
  });

  it("refuses to boot with a missing NUXT_AUTH_SECRET, naming it", async () => {
    await stopServer();

    try {
      await expect(startServer({ env: { NUXT_AUTH_SECRET: "" } })).rejects.toThrow();
      expect(getServerLogs().join("\n")).toContain("NUXT_AUTH_SECRET");
    } finally {
      await startServer();
    }
  }, 120000);

  it("refuses to boot in production without the Redis, site, audit chain secret, mail, storage and Stripe settings, naming each", async () => {
    await stopServer();

    try {
      await expect(
        startServer({
          env: {
            NODE_ENV: "production",
            NUXT_REDIS_URL: "",
            NUXT_SITE_URL: "",
            NUXT_AUDIT_CHAIN_SECRET: "",
            NUXT_MAIL_URL: "",
            NUXT_STORAGE_URL: "",
            NUXT_STORAGE_BUCKET: "",
            NUXT_STRIPE_SECRET_KEY: "",
            NUXT_STRIPE_WEBHOOK_SECRET: "",
          },
        }),
      ).rejects.toThrow();

      const logs = getServerLogs().join("\n");

      const names = ["NUXT_REDIS_URL", "NUXT_SITE_URL", "NUXT_MAIL_URL", "NUXT_AUDIT_CHAIN_SECRET", "NUXT_STORAGE_URL", "NUXT_STORAGE_BUCKET", "NUXT_STRIPE_SECRET_KEY", "NUXT_STRIPE_WEBHOOK_SECRET"];

      for (const name of names) {
        expect(logs).toContain(`${name}: Required in production`);
      }

      const envLine = getServerLogs().find((line) => line.startsWith("{") && line.includes('"tag":"env"'));

      expect(envLine).toBeDefined();
      expect(envLine).not.toContain("stack");
      expect(JSON.parse(envLine ?? "{}")).toMatchObject({
        level: "fatal",
        variables: names,
        problems: names.map((variable) => ({
          variable,
          problem: "Required in production",
          hint: expect.stringMatching(/^(Set it to|Copy)/),
        })),
      });
    } finally {
      await startServer();
    }
  }, 120000);
});
