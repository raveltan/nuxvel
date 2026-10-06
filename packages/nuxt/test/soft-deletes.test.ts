import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("soft deletes", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_soft-deletes-check");

  it("softDelete sets deletedAt on live rows only and returns them", () => {
    expect(probe().softDeleted).toEqual([{ title: "trashed", trashed: true }]);
    expect(probe().softDeletedAgain).toBe(0);
  });

  it("notTrashed and onlyTrashed split the rows", () => {
    expect(probe().listed).toEqual({ notTrashed: ["kept"], onlyTrashed: ["trashed"] });
  });

  it("findOrFail skips a trashed row unless trashed says otherwise", () => {
    expect(probe().found).toEqual({
      trashedByDefault: true,
      trashedIncluded: "trashed",
      trashedOnly: "trashed",
      keptOnly: true,
    });
  });

  it("restore clears deletedAt on trashed rows only", () => {
    expect(probe().restored).toEqual([{ title: "trashed", deletedAt: null }]);
    expect(probe().restoredAgain).toBe(0);
  });

  it("forceDelete removes the row for good", () => {
    expect(probe().forceDeleted).toEqual(["kept"]);
    expect(probe().forceDeletedGone).toBe(true);
  });

  it("softDelete, restore and forceDelete take an id, return the row and throw NotFoundError when no row matches", () => {
    expect(probe().byId).toEqual({
      softDeleted: true,
      softDeletedAgain: true,
      restored: null,
      restoredAgain: true,
      forceDeleted: "by id",
      forceDeletedAgain: true,
    });
  });
});
