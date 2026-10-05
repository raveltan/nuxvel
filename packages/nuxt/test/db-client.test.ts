import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("useDb", async () => {
  await setupPlayground();

  it("executes a raw query against NUXT_DATABASE_URL", async () => {
    const body = await guest().$fetch("/api/_db-check");
    expect(body).toEqual({ ok: true });
  });

  it("stops statements after 15 seconds and idle transactions after 30 seconds", async () => {
    expect(await guest().$fetch("/api/_db-timeouts-check")).toEqual({ statement: "15s", idleInTransaction: "30s" });
  });
});
