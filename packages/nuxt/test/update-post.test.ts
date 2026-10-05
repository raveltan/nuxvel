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

  it("rejects an empty-after-trim body, surfaced as an action error and as a tRPC error", async () => {
    const owner = await userFactory();
    const post = await postFactory({ authorId: owner.id });
    const input = { id: post.id, title: "After", body: "   " };

    const actionError = await runAction("posts.update-post", input, { actingAs: owner }).catch((caught: unknown) => caught);

    expect(actionError).toBeActionError("post.body-empty");
    await expect(actingAs(owner).trpc.post.update(input)).rejects.toBeTrpcError("UNPROCESSABLE_CONTENT");
  });
});
