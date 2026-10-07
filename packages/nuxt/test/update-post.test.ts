import { describe, it } from "vitest";
import { actingAs, expect, expectRow, runAction } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { setupPlayground } from "./helpers/playground";

describe("update-post action (owner-only via policy)", async () => {
  await setupPlayground();

  it("lets the owner update and forbids another user", async () => {
    const owner = await userFactory();
    const post = await postFactory({ authorId: owner.id });

    const updated = await runAction(
      "posts.update-post",
      { id: post.id, title: "After", body: "After body" },
      { actingAs: owner },
    );

    expect(updated).toMatchObject({ title: "After", body: "After body" });
    expect(await expectRow(postsTable, { id: post.id })).toMatchObject({ title: "After", body: "After body" });

    await expect(
      runAction("posts.update-post", { id: post.id, title: "Hacked", body: "Hacked" }, { actingAs: await userFactory() }),
    ).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("answers NOT_FOUND for a post that does not exist, through findAuthorized()", async () => {
    await expect(
      runAction("posts.update-post", { id: 999_999, title: "Ghost", body: "Ghost" }, { actingAs: await userFactory() }),
    ).rejects.toBeTrpcError("NOT_FOUND");
  });

  it("rejects an empty-after-trim body, surfaced as an action error and as a tRPC error", async () => {
    const owner = await userFactory();
    const post = await postFactory({ authorId: owner.id });
    const input = { id: post.id, title: "After", body: "   " };

    const actionError = await runAction("posts.update-post", input, { actingAs: owner }).catch((caught: unknown) => caught);

    expect(actionError).toBeActionError("post.body-empty");
    await expect(actingAs(owner).api.post.update(input)).rejects.toBeTrpcError("UNPROCESSABLE_CONTENT");
    await expect(actingAs(owner).api.post.update(input)).rejects.toHaveValidationErrors({
      body: "Body cannot be empty after trimming",
    });
  });

  it("sends the failure's field in data.fields over HTTP, next to data.actionCode", async () => {
    const owner = await userFactory();
    const post = await postFactory({ authorId: owner.id });

    const response = await actingAs(owner).fetch("/api/trpc/post.update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { id: post.id, title: "After", body: "   " } }),
    });

    expect(response.status).toBe(422);
    expect((await response.json()).error.json.data).toMatchObject({
      code: "UNPROCESSABLE_CONTENT",
      actionCode: "post.body-empty",
      fields: { body: ["Body cannot be empty after trimming"] },
    });
  });
});
