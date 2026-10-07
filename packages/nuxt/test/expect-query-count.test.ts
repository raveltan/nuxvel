import { describe, it } from "vitest";

import { expect, expectQueryCount, guest } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { setupPlayground } from "./helpers/playground";

describe("expectQueryCount", async () => {
  await setupPlayground();

  it("passes at the budget and returns the count", async () => {
    const post = await postFactory();

    expect(await expectQueryCount({ max: 2 }, async () => {
      await guest().api.post.byId({ id: post.id });
      await guest().api.post.byId({ id: post.id });
    })).toBe(2);
  });

  it("fails over the budget", async () => {
    const post = await postFactory();

    await expect(expectQueryCount({ max: 1 }, async () => {
      await guest().api.post.byId({ id: post.id });
      await guest().api.post.byId({ id: post.id });
    })).rejects.toThrow("expectQueryCount: the app ran 2 queries, over the budget of 1");
  });

  it("lists the queries when over the budget", async () => {
    const post = await postFactory();

    const failure = await expectQueryCount({ max: 1 }, async () => {
      await guest().api.post.byId({ id: post.id });
      await guest().api.post.byId({ id: post.id });
    }).catch((error: Error) => error.message);

    expect(failure).toMatch(/\n  1\. select .*"posts"/);
    expect(failure).toMatch(/\n  2\. select .*"posts"/);
  });
});
