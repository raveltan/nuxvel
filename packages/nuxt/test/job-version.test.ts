import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("versioned job payloads", async () => {
  await setupPlayground();

  it("upcasts an old payload and leaves a current one alone", async () => {
    const body = await guest().$fetch("/api/_job-version-check");

    expect(body.rows).toEqual(["already-current", "upcast-me"]);
    expect(body.version).toBe(2);
    expect(body.queued).toEqual([
      {
        jobName: "_probe.record-renamed",
        payload: { version: 2, payload: { name: "dispatched" } },
      },
    ]);
  });
});
