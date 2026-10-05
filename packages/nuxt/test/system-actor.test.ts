import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("required actor + systemActor()", async () => {
  await setupPlayground();

  it("passes a real actor through and throws at runtime when bypassed without one", async () => {
    const body = await guest().$fetch("/api/_system-actor-check");

    expect(body.withActor).toEqual({ value: "ok" });
    expect(body.threwWithoutActor).toBe(true);
    expect(body.actor).toEqual({ type: "system", id: "cli" });
  });
});
