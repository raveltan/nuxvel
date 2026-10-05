import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("findOrFail", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_find-or-fail-check");

  it("returns the row for an existing id and throws NotFoundError for a missing one", async () => {
    const body = probe();
    expect(body).toMatchObject({
      matches: true,
      threwNotFound: true,
    });
  });

  it("loads a row of a text-keyed table by its string id", async () => {
    const body = probe();
    expect(body.matchesTextId).toBe(true);
  });

  it("throws an error isTaxonomyError recognizes as NOT_FOUND", async () => {
    const body = probe();
    expect(body.isTaxonomyNotFound).toBe(true);
  });

  it("firstOrFail throws NotFoundError for an empty result", async () => {
    const body = probe();
    expect(body.firstOfNothingNotFound).toBe(true);
  });
});
