import { describe, it } from "vitest";

import { expect, expectRow, runAction } from "@nuxvel/nuxt/testing";
import { $actions } from "#nuxvel/test-namespaces";
import { tagsTable } from "../../../playground/server/database/schema/tags.schema";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("runAction()", async () => {
  await setupPlayground();

  it("runs an action in the app as a user and returns what it returns", async () => {
    const author = await userFactory();

    const post = await runAction(
      "posts.create-post",
      { title: "Hello", body: "World" },
      { actingAs: author },
    );

    expect(post.authorId).toBe(author.id);
    expect(post.createdAt).toBeInstanceOf(Date);
    await expectRow(postsTable, { id: post.id, title: "Hello" });
  });

  it("takes an action's $actions stub in place of its name", async () => {
    const author = await userFactory();

    const post = await runAction($actions.posts.createPost, { title: "Stub", body: "" }, { actingAs: author });

    await expectRow(postsTable, { id: post.id, title: "Stub", authorId: author.id });
  });

  it("rejects with the action's declared failure or its validation errors", async () => {
    const author = await userFactory();
    const post = await postFactory.for("authorId", author)();

    await expect(
      runAction("posts.update-post", { id: post.id, title: "Kept", body: "  " }, { actingAs: author }),
    ).rejects.toBeActionError("post.body-empty");
    await expect(
      runAction("posts.create-post", { title: "", body: "" }, { actingAs: author }),
    ).rejects.toHaveValidationErrors("title");
  });

  it("authorizes as that user", async () => {
    const post = await postFactory();

    await expect(
      runAction(
        "posts.update-post",
        { id: post.id, title: "Hacked", body: "Hacked" },
        { actingAs: await userFactory() },
      ),
    ).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("runs an action as a system actor with asSystem", async () => {
    const post = await postFactory();

    const tag = await runAction("tags.create-tag", { name: "system" }, { asSystem: "nightly" });

    await expectRow(tagsTable, { id: tag.id, name: "system" });
    await expect(
      runAction("posts.update-post", { id: post.id, title: "Hacked", body: "Hacked" }, { asSystem: "nightly" }),
    ).rejects.toBeTrpcError("FORBIDDEN");
  });
});
