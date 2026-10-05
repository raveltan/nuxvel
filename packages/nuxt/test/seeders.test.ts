import { expect, expectAudited, expectCount, expectRow, guest, runSeeder, signIn } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { $seeders } from "#nuxvel/test-namespaces";
import { userTable } from "../../../playground/server/database/schema/auth.schema";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { setupPlayground } from "./helpers/playground";

describe("defineSeeder", async () => {
  await setupPlayground();

  it("runs a seeder with its factories, useDb() writes and audit() as the seed actor, calls each seeder once, and rolls a failed run back, given its name or its stub", async () => {
    await runSeeder("_probe.posts");

    const author = await expectRow(userTable, { email: "seeded-author@example.com", name: "Seeded Author" });
    await expectRow(postsTable, { title: "Seeded by a factory", authorId: author.id });
    const post = await expectRow(postsTable, { title: "Seeded by useDb", authorId: author.id });
    await expectAudited("post.seeded", { actorType: "system", actorId: "seed", targetId: String(post.id) });

    await expect(runSeeder($seeders._probe.posts)).rejects.toThrow(/Failed query: insert into "user"/);

    await expectCount(healthChecksTable, 1, { name: "seeded-before-author" });
    await expectCount(postsTable, 2, { authorId: author.id });
  });

  it("seeds the playground with a demo user who signs in with the printed password, and posts that the cached post.list returns", async () => {
    expect((await guest().trpc.post.list({ q: "playground" })).rows).toEqual([]);

    await runSeeder("database");

    const demo = await expectRow(userTable, { email: "demo@example.com" });
    await expectRow(postsTable, { title: "Welcome to the playground", authorId: demo.id });
    expect((await guest().trpc.post.list({ q: "playground" })).rows.map(({ title }) => title)).toContain(
      "Welcome to the playground",
    );

    await signIn("demo@example.com", "demo-password");
  });
});
