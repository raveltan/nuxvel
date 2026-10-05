import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("typed fail() / errors map / isActionError()", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_action-fail-check");

  it("fail() throws an error isActionError recognizes by its declared code", async () => {
    const body = probe();

    expect(body.succeeded).toEqual({ ok: true });
    expect(body).toMatchObject({
      isDeclaredCode: true,
      isOtherCode: false,
    });
  });

  it("isActionError(err, action, code) matches only that action's failure", async () => {
    const body = probe();

    expect(body).toMatchObject({
      failedAction: "_action-fail-check.doThing",
      isThisAction: true,
      isOtherAction: false,
    });
  });
});
