import { describe, it } from "vitest";

import { actingAs, expect, expectConstantQueries } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("canMany()", async () => {
  await setupPlayground();

  it("answers each row like can() and runs the policy preload once for the list", async () => {
    const admin = actingAs(await userFactory({ role: "admin" })).trpc;
    let answers: { id: number; can: unknown }[] = [];
    let expected: { id: number; can: unknown }[] = [];

    await expectConstantQueries(async (size) => {
      const adminAuthor = await userFactory({ role: "admin" });
      const byAdmin = await postFactory.for("authorId", adminAuthor)();
      const byUsers = await Promise.all(Array.from({ length: size }, () => postFactory()));

      expected = [
        { id: byAdmin.id, can: { update: false, delete: false } },
        ...byUsers.map((post) => ({ id: post.id, can: { update: true, delete: true } })),
      ];
      answers = await admin.post.abilitiesMany({ ids: expected.map((row) => row.id) });
    }, [1, 10]);

    expect(answers).toEqual(expected);
  });

  it("returns an empty list for no rows", async () => {
    const { trpc } = actingAs(await userFactory());

    expect(await trpc.post.abilitiesMany({ ids: [] })).toEqual([]);
  });
});
