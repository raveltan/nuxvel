import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("defineAction transaction boundary", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_action-transaction-check");

  it("rolls back the write by default when the handler throws", async () => {
    const body = probe();
    expect(body.transactionalRowAdded).toBe(false);
  });

  it("leaves the write in place when transaction: false and the handler throws", async () => {
    const body = probe();
    expect(body.nonTransactionalRowAdded).toBe(true);
  });
});
