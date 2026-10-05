import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("server/errors classifiers", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_error-classifier-check");

  it("maps a fake SDK error an action lets escape through the app's classifier", () => {
    expect(probe()).toEqual({
      duplicate: "CONFLICT: This customer already exists",
      serverError: "SERVICE_UNAVAILABLE",
    });
  });
});
