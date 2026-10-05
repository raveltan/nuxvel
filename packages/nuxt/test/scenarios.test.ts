import { describe, it } from "vitest";
import { actingAs, expect, expectCount } from "@nuxvel/nuxt/testing";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { blog } from "../../../playground/tests/scenarios/blog";
import { setupPlayground } from "./helpers/playground";

describe("a scenario from tests/scenarios/", async () => {
  await setupPlayground();

  it("returns typed rows that the app sees", async () => {
    const { author, posts: written } = await blog({ posts: 3 });

    expect(written.map((post) => post.authorId)).toEqual([author.id, author.id, author.id]);
    await expectCount(postsTable, 3, { authorId: author.id });
    const read = await actingAs(author).trpc.post.byId({ id: written[0]?.id ?? 0 });
    expect(read.title).toBe("Post 1");
  });
});
