import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";

import { expect, runAction } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("Postgres foreign-key-violation mapping", async () => {
  await setupPlayground();

  it("answers a reference to a missing row with a validation error on the column", async () => {
    const author = await userFactory();
    const post = await postFactory.for("authorId", author)();

    const failure = runAction(
      "_probes.assign-post-author",
      { postId: post.id, authorId: randomUUID() },
      { actingAs: author },
    );

    await expect(failure).rejects.toHaveValidationErrors("authorId");
    await expect(failure).rejects.toMatchObject({ fields: { authorId: ["does not exist"] } });
  });

  it("answers a change to a row other rows still reference with a conflict", async () => {
    const author = await userFactory();
    await postFactory.for("authorId", author)();

    await expect(
      runAction("_probes.change-user-id", { id: author.id, newId: randomUUID() }, { actingAs: author }),
    ).rejects.toBeTrpcError("CONFLICT");
  });
});
