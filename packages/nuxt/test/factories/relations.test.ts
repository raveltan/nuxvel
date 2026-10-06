import { describe, it } from "vitest";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { expect, expectCount, expectRow } from "@nuxvel/nuxt/testing";
import { userTable } from "../../../../playground/server/database/schema/auth.schema";
import { postsTable } from "../../../../playground/server/database/schema/posts.schema";
import { postFactory } from "../../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../../playground/server/factories/users.factory";

describe("factory .for() / .has()", () => {
  it("points .for()'s column at the related row", async () => {
    const author = await userFactory();

    const post = await postFactory.for("authorId", author)();

    expect(post.authorId).toBe(author.id);
  });

  it("inserts .has()'s children for each parent, and chains", async () => {
    const author = await userFactory
      .has(3, (user) => postFactory.for("authorId", user))
      .has(1, (user) => postFactory.for("authorId", user).state({ title: "Pinned" }))();

    await expectCount(postsTable, 4, { authorId: author.id });
    await expectCount(postsTable, 1, { authorId: author.id, title: "Pinned" });
  });

  it("creates a missing parent row from the factory defined for the parent table", async () => {
    const post = await defineFactory(postsTable)();

    const author = await expectRow(userTable, { id: post.authorId });

    expect(author.email).toMatch(/\d+@example\.com$/);
  });

  it("sets the ...Id column from a parent row given by its relation name", async () => {
    const author = await userFactory();

    const post = await defineFactory(postsTable)({ author, title: "Mine" });

    expect(post).toMatchObject({ authorId: author.id, title: "Mine" });
    await expectCount(userTable, 1);
  });

  it("reuses a recycled row as the missing parent", async () => {
    const author = await userFactory();

    const posts = await defineFactory(postsTable).recycle(userTable, author).count(2)();

    expect(posts.map((post) => post.authorId)).toEqual([author.id, author.id]);
    await expectCount(userTable, 1);
  });
});
