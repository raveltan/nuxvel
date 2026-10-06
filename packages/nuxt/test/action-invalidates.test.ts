import { describe, it } from "vitest";
import { expect, expectCached, runAction } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function cachedOrNull(key: string | readonly unknown[]) {
  return expectCached(key).catch(() => null);
}

async function cacheState(id: number) {
  return {
    row: await cachedOrNull(["probe-tag", id]),
    below: await cachedOrNull(["probe-tag", id, "comments"]),
    otherRow: await cachedOrNull(["probe-tag", id + 1]),
    plain: await cachedOrNull("probe-plain"),
    underPlain: await cachedOrNull("probe-plain:list"),
    otherPlain: await cachedOrNull("probe-plainer"),
    globbed: await cachedOrNull("probe-glob:1"),
  };
}

describe("an action's invalidates", async () => {
  await setupPlayground();

  it("forgets each tag computed from the result and the input, and every key under it, after the commit", async () => {
    await runAction("_probes.invalidate-tags", { id: 7 }, { actingAs: await userFactory() });

    expect(await cacheState(7)).toEqual({
      row: null,
      below: null,
      otherRow: "other row",
      plain: null,
      underPlain: null,
      otherPlain: "other plain",
      globbed: null,
    });
  });

  it("forgets nothing when the handler throws", async () => {
    const failure = runAction("_probes.invalidate-tags", { id: 7, fail: true }, { actingAs: await userFactory() });

    await expect(failure).rejects.toThrow("rolled back");
    expect(await cacheState(7)).toEqual({
      row: "row",
      below: "below",
      otherRow: "other row",
      plain: "plain",
      underPlain: "under plain",
      otherPlain: "other plain",
      globbed: "globbed",
    });
  });
});
