import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("versioned event payloads", async () => {
  await setupPlayground();

  it("upcasts a queued payload to the event's current version before the listener runs", async () => {
    const body = await guest().$fetch("/api/_event-version-check");

    expect(body.version).toBe(2);
    expect(body.upcast).toEqual(["upcast-me"]);
    expect(body.current).toEqual(["already-current"]);
    expect(body.newerThrew).toBe(true);
  });
});
