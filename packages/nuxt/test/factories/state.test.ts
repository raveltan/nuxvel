import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory } from "../../../../playground/server/factories/posts.factory";

describe("factory .state()", () => {
  it("applies the state's overrides on top of the base definition, under a per-call override", async () => {
    const archivedPostFactory = postFactory.state({ body: "factory state body" });

    const base = await postFactory();
    const archived = await archivedPostFactory();
    const explicit = await archivedPostFactory({ body: "explicit override" });

    expect(base.body).not.toBe("factory state body");
    expect(archived.body).toBe("factory state body");
    expect(explicit.body).toBe("explicit override");
  });

  it("trashed() inserts a soft-deleted row", async () => {
    const live = await postFactory();
    const trashed = await postFactory.trashed()();

    expect(live.deletedAt).toBeNull();
    expect(trashed.deletedAt).toBeInstanceOf(Date);
  });
});
