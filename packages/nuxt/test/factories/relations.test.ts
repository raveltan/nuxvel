import { describe, it } from "vitest";
import { expect, expectCount } from "@nuxvel/nuxt/testing";
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
});
