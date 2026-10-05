import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("nested action calls join the outer transaction as a savepoint", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_nested-action-savepoint-check");

  it("keeps the outer action's prior writes when it catches the inner action's failure", async () => {
    const body = probe();
    expect(body.rowsAddedWhenCaught).toBe(1);
  });

  it("rolls back both actions' writes when the inner action's failure propagates uncaught", async () => {
    const body = probe();
    expect(body.rowsAddedWhenPropagated).toBe(0);
  });
});
