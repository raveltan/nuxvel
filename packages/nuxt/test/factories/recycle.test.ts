import { describe, it } from "vitest";
import { expect, expectCount } from "@nuxvel/nuxt/testing";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { postsTable } from "../../../../playground/server/database/schema/posts.schema";
import { userTable } from "../../../../playground/server/database/schema/auth.schema";
import { postFactory } from "../../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../../playground/server/factories/users.factory";

describe("factory .recycle()", () => {
  it("reuses the row in a definition function", async () => {
    const author = await userFactory();
    const post = await postFactory.recycle(userTable, author)();

    expect(post.authorId).toBe(author.id);
    await expectCount(userTable, 1);
  });

  it("reuses the row in a .has() child", async () => {
    const author = await userFactory();
    const parent = defineFactory(postsTable, { authorId: async () => (await userFactory()).id }).has(1, () => postFactory);

    await parent.recycle(userTable, author)();

    await expectCount(postsTable, 2, { authorId: author.id });
    await expectCount(userTable, 1);
  });

  it("still inserts when the nested call has overrides", async () => {
    const author = await userFactory();
    const nested = defineFactory(postsTable, {
      authorId: async () => (await userFactory({ name: "Other" })).id,
    });

    const post = await nested.recycle(userTable, author)();

    expect(post.authorId).not.toBe(author.id);
  });

  it("does not leak into a factory without .recycle()", async () => {
    const author = await userFactory();
    await postFactory.recycle(userTable, author)();
    const post = await postFactory();

    expect(post.authorId).not.toBe(author.id);
    await expectCount(userTable, 2);
  });
});
