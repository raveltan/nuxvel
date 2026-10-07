import { describe, it } from "vitest";

import { expect, guest } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("paginateCursor() through post.feed", async () => {
  await setupPlayground();

  it("walks every page and returns each post once, in order", async () => {
    const author = await userFactory();
    const written = [];

    for (let n = 0; n < 7; n++) written.push(await postFactory.for("authorId", author)());

    const seen: number[] = [];
    let cursor: number | null = null;
    let pages = 0;

    do {
      const page: { rows: { id: number }[]; nextCursor: number | null } = await guest().api.post.feed({ cursor, limit: 3 });

      seen.push(...page.rows.map((post) => post.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor !== null);

    expect(seen).toEqual(written.map((post) => post.id).sort((a, b) => b - a));
    expect(pages).toBe(3);
  });

  it("gives no next cursor when the first page holds every row", async () => {
    await postFactory();

    expect(await guest().api.post.feed({ limit: 5 })).toMatchObject({ nextCursor: null });
  });
});
