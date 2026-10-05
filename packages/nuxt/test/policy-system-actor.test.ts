import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("policies vs system actors", async () => {
  await setupPlayground();

  it("denies system actors by default and allows them only through allowSystem rules", async () => {
    const body = await guest().$fetch("/api/_system-actor-policy-check");

    expect(body).toMatchObject({
      updateDenied: false,
      probeAllowed: true,
      probeDeniedForOtherRow: false,
    });
  });
});
