import { describe, it } from "vitest";
import { expect, expectAudited, expectQueued, expectRow, runAction } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { setupPlayground } from "./helpers/playground";

describe("create-post action", async () => {
  await setupPlayground();

  it("lets an author create a post", async () => {
    const author = await userFactory();

    const post = await runAction("posts.create-post", { title: "Hello", body: "World" }, { actingAs: author });

    expect(post).toMatchObject({ title: "Hello", body: "World", authorId: author.id });
    await expectRow(postsTable, { id: post.id });
    await expectAudited("post.created", { targetId: String(post.id) });
    await expectQueued("post.notify-followers", { postId: post.id });
  });

  it("surfaces invalid input through the toHaveValidationErrors matcher", async () => {
    const author = await userFactory();

    const error = await runAction("posts.create-post", { title: "", body: "" }, { actingAs: author }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toHaveValidationErrors("title");
  });

  it("passes markup in the input of an action through the test control route", async () => {
    const author = await userFactory();

    const post = await runAction("posts.create-post", { title: "Hello", body: "<script>alert(1)</script>" }, { actingAs: author });

    expect(post.body).toBe("<script>alert(1)</script>");
  });
});
