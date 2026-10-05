import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished } from "vitest";
import { startSecondServer } from "./helpers/second-server";

async function poolMax(env?: Record<string, string>) {
  const server = await startSecondServer({ env });
  onTestFinished(() => server.stop());

  return (await (await fetch(new URL("/api/_db-pool-check", server.url))).json()).max;
}

describe("database pool size", () => {
  it("opens at most 10 connections per process by default", { timeout: 40_000 }, async () => {
    expect(await poolMax()).toBe(10);
  });

  it("takes NUXT_DATABASE_POOL_MAX, which nuxvel deploy sets per process", { timeout: 40_000 }, async () => {
    expect(await poolMax({ NUXT_DATABASE_POOL_MAX: "3" })).toBe(3);
  });
});
