import { describe, it } from "vitest";

import { captureQueries, expect, expectConstantQueries, guest } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";
import { flushWorkerRedis } from "./setup/redis";

describe("expectConstantQueries", async () => {
  await setupPlayground();

  it("fails when the app runs a query per row", async () => {
    const post = await postFactory.for("authorId", await userFactory())();
    const perRow = expectConstantQueries(async (size) => {
      for (let call = 0; call < size; call++) await guest().trpc.post.byId({ id: post.id });
    });

    const failure = await perRow.catch((error: Error) => error.message);

    expect(failure).toContain("query count varies with input size (size 1: 1 queries, size 4: 4 queries)");
    expect(failure).toMatch(/3x select .*"posts"/);
  });

  it("shows the extra queries of the largest run when the first run does more work", async () => {
    const post = await postFactory.for("authorId", await userFactory())();

    const failure = await expectConstantQueries(async (size) => {
      for (let call = 0; call < (size === 1 ? 3 : 2); call++) await guest().trpc.post.byId({ id: post.id });
    }).catch((error: Error) => error.message);

    expect(failure).toContain("size 1: 3 queries, size 4: 2 queries");
    expect(failure).toContain("Queries only at size 1:");
    expect(failure).toMatch(/1x select .*"posts"/);
  });

  it("captureQueries returns the SQL of the app's queries, and nothing for a call with no app", async () => {
    const post = await postFactory.for("authorId", await userFactory())();

    const sql = await captureQueries(() => guest().trpc.post.byId({ id: post.id }));

    expect(sql).toHaveLength(1);
    expect(sql[0]).toMatch(/from "posts"/);
    expect(await captureQueries(async () => undefined)).toEqual([]);
  });

  it("passes one list call over any number of rows, not counting what factories insert", async () => {
    const count = await expectConstantQueries(async (size) => {
      await userFactory.has(size, (user) => postFactory.for("authorId", user))();
      await flushWorkerRedis();
      await guest().trpc.post.list();
    });

    expect(count).toBe(1);
  });
});
