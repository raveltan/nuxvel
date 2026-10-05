import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("useRedis", async () => {
  await setupPlayground();

  it("reuses one client per purpose and keeps purposes apart", async () => {
    const body = await guest().$fetch("/api/_redis-check");

    expect(body).toEqual({
      sameInstancePerPurpose: true,
      distinctInstancePerPurpose: true,
      pong: "PONG",
    });
  });
});
