import { describe, it } from "vitest";

import { expect, expectRow, guest, runAction } from "@nuxvel/nuxt/testing";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("an action called without an actor", async () => {
  await setupPlayground();

  it("runs as the actor of the action that calls it", async () => {
    const author = await userFactory();

    const post = await runAction(
      "_probes.create-post-as-caller",
      { title: "Nested", body: "Inherited" },
      { actingAs: author },
    );

    expect(post.authorId).toBe(author.id);
    await expectRow(postsTable, { id: post.id, authorId: author.id });
  });

  it("throws an error that names the action, or the audit, and the fix when no actor is in scope", async () => {
    const body = await guest().$fetch("/api/_implicit-actor-check");

    expect(body.error).toBe(
      '_probes.create-post-as-caller ran with no actor. Call it inside a procedure, job or seeder, or pass { actor: systemActor("name") }',
    );
    expect(body.auditError).toBe(
      'audit("post.checked") ran with no actor. Call it inside a procedure, action, job or seeder, or inside an action called with { actor: systemActor("name") }',
    );
  });
});
