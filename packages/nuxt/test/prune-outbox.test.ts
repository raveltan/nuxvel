import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("pruning the outbox", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_prune-outbox-check");

  it("deletes the rows relayed longer ago than 7 days by default, and never a row not yet relayed", () => {
    expect(probe().byDefault).toBe(1);
    expect(probe().afterDefault).toEqual(["not relayed", "relayed 2 days ago"]);
  });

  it("takes a shorter retention as a Postgres interval", () => {
    expect(probe().byOneDay).toBe(1);
    expect(probe().afterOneDay).toEqual(["not relayed"]);
  });
});
