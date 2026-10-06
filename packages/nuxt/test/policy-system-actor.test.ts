import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("policies vs system actors", async () => {
  await setupPlayground();

  it("denies the guest actor by default and allows it only through allowGuest rules", async () => {
    const body = await guest().$fetch("/api/_system-actor-policy-check");

    expect(body).toMatchObject({ guestDeniedByDefault: false, guestAllowed: true });
  });

  it("skips the preload of a policy when every rule asked for denies the actor's type", async () => {
    const body = await guest().$fetch("/api/_system-actor-policy-check");

    expect(body.deniedWithoutPreload).toEqual([false, [{ rename: false }]]);
  });

  it("keeps both flags when allowSystem() and allowGuest() wrap each other", async () => {
    const body = await guest().$fetch("/api/_system-actor-policy-check");

    expect(body.composed).toEqual([true, true, true, true]);
  });

  it("denies system actors by default and allows them only through allowSystem rules", async () => {
    const body = await guest().$fetch("/api/_system-actor-policy-check");

    expect(body).toMatchObject({
      updateDenied: false,
      probeAllowed: true,
      probeDeniedForOtherRow: false,
    });
  });
});
