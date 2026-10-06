import { describe, it } from "vitest";
import { can, expect, guest } from "@nuxvel/nuxt/testing";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("can()", async () => {
  await setupPlayground();

  it("reads the ambient actor, resolves the row's table policy by name or by ability ref, sees a userActor() role and denies when none is registered", async () => {
    const body = await guest().$fetch("/api/_can-check");

    expect(body).toMatchObject({
      adminAllowed: true,
      ownerAllowed: true,
      otherAllowed: false,
      ownerAllowedByRef: true,
      otherAllowedByRef: false,
      unknownAction: false,
      inheritedConstructor: false,
      inheritedToString: false,
      inheritedMany: [{ constructor: false }],
      unregisteredTable: false,
      guestInRequest: false,
      outsideRequest:
        'can() ran with no actor. Call it inside a procedure, action, job or seeder, or inside an action called with { actor: systemActor("name") }',
    });
  });

  it("answers a policy rule for a user in the app, as the test fixture can()", async () => {
    const author = await userFactory();
    const stranger = await userFactory();
    const admin = await userFactory({ role: "admin" });
    const post = await postFactory({ authorId: author.id });

    expect(await can(author, "update", postsTable, post)).toBe(true);
    expect(await can(stranger, "update", postsTable, post)).toBe(false);
    expect(await can(admin, "update", postsTable, post)).toBe(true);
  });
});
