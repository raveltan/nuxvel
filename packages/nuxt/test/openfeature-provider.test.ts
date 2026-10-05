import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("nuxvelFlagProvider()", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_openfeature-check");

  it("resolves a flag through an OpenFeature client, with its targeting", () => {
    expect(probe()).toMatchObject({ on: true, off: false });
  });

  it("resolves an experiment to its variant", () => {
    expect(probe().variant).toMatch(/^(control|green)$/);
  });

  it("answers the default with an error code for an unknown name or a wrong type", () => {
    expect(probe().unknown).toMatchObject({ value: true, errorCode: "FLAG_NOT_FOUND" });
    expect(probe().mismatch).toMatchObject({ value: 7, errorCode: "TYPE_MISMATCH" });
  });
});
