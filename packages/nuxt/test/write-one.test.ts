import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("insertOne and updateOne", async () => {
  await setupPlayground();
  const probe = runProbeOnce("/api/_write-one-check");

  it("insertOne returns the inserted row with its id", () => {
    expect(probe().inserted).toEqual({ name: "inserted", hasId: true });
  });

  it("updateOne returns the updated row", () => {
    expect(probe().updated).toEqual({ id: true, name: "updated" });
  });

  it("updateOne throws NotFoundError for a missing id and for a trashed row", () => {
    expect(probe()).toMatchObject({ missingNotFound: true, trashedNotFound: true });
  });

  it("joins the ambient transaction, so a rollback discards the insert", () => {
    expect(probe().rolledBack).toBe(true);
  });
});
