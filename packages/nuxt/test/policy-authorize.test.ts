import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("authorize()", async () => {
  await setupPlayground();

  it("passes when allowed and throws ForbiddenError when denied", async () => {
    const body = await guest().$fetch("/api/_authorize-check");

    expect(body).toMatchObject({
      ownerPassed: true,
      otherDeniedAs: "ForbiddenError",
      inheritedDeniedAs: "ForbiddenError",
      deniedByRefAs: expect.stringMatching(/is not allowed to update health_checks$/),
    });
  });
});
