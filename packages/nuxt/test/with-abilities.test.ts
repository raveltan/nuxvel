import { describe, it } from "vitest";

import { actingAs, expect, expectConstantQueries, guest } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("withAbilities()", async () => {
  await setupPlayground();

  it("adds can to each row of a paginated list like can() would, and runs the policy preload once for the list", async () => {
    const admin = actingAs(await userFactory({ role: "admin" })).trpc;
    let answers: { id: number; can: unknown }[] = [];
    let expected: { id: number; can: unknown }[] = [];

    await expectConstantQueries(async (size) => {
      const adminAuthor = await userFactory({ role: "admin" });
      const byAdmin = await postFactory.for("authorId", adminAuthor)();
      const byUsers = await Promise.all(Array.from({ length: size }, () => postFactory()));

      expected = [
        { id: byAdmin.id, can: { update: false, delete: false } },
        ...byUsers.map((post) => ({ id: post.id, can: { update: true, delete: true } })),
      ];
      const page = await admin.post.list({ perPage: 50 + size });
      answers = page.rows.filter((row) => expected.some((post) => post.id === row.id)).map(({ id, can }) => ({ id, can }));
    }, [1, 10]);

    expect(answers.sort((a, b) => a.id - b.id)).toEqual(expected.sort((a, b) => a.id - b.id));
  });

  it("adds can to one row for its author, another user and a guest", async () => {
    const author = await userFactory();
    const post = await postFactory({ authorId: author.id });

    expect((await actingAs(author).trpc.post.byId({ id: post.id })).can).toEqual({ update: true, delete: true });
    expect((await actingAs(await userFactory()).trpc.post.byId({ id: post.id })).can).toEqual({ update: false, delete: false });
    expect((await guest().trpc.post.byId({ id: post.id })).can).toEqual({ update: false, delete: false });
  });

  it("returns an empty list for no rows", async () => {
    const { trpc } = actingAs(await userFactory());

    expect((await trpc.post.list({ q: "no post has this title" })).rows).toEqual([]);
  });
});
