import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("transient database errors", async () => {
  await setupPlayground();
  const probe = runProbeOnce<string[]>("/api/_transient-error-check");

  it("surfaces the deadlock victim of two actions as SERVICE_UNAVAILABLE and commits the other", () => {
    expect(probe().toSorted()).toEqual(["SERVICE_UNAVAILABLE", "committed"]);
  });
});
