import { describe, it } from "vitest";

import { expect, guest } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function postsTitled(titles: string[]) {
  const author = await userFactory();

  for (const title of titles) await postFactory({ title, authorId: author.id });
}

describe("paginate() through post.list", async () => {
  await setupPlayground();

  it("returns one page of rows with the total and the last page", async () => {
    await postsTitled(["One", "Two", "Three", "Four", "Five"]);

    const second = await guest().api.post.list({ page: 2, perPage: 2 });

    expect(second).toMatchObject({ page: 2, perPage: 2, total: 5, lastPage: 3 });
    expect(second.rows.map((post) => post.title)).toEqual(["Three", "Two"]);

    const beyond = await guest().api.post.list({ page: 9, perPage: 2 });

    expect(beyond).toMatchObject({ rows: [], page: 9, total: 5, lastPage: 3 });
  });

  it("clamps the page and the page size, and defaults to 20 rows", async () => {
    await postsTitled(Array.from({ length: 21 }, (_, index) => `Post ${index}`));

    expect(await guest().api.post.list({ page: 0, perPage: 500 })).toMatchObject({
      page: 1,
      perPage: 100,
      total: 21,
      lastPage: 1,
    });
    expect(await guest().api.post.list({ perPage: 0 })).toMatchObject({ perPage: 1, total: 21 });

    const firstPage = await guest().api.post.list();

    expect(firstPage).toMatchObject({ page: 1, perPage: 20, total: 21, lastPage: 2 });
    expect(firstPage.rows).toHaveLength(20);
  });

  it("searches with q", async () => {
    await postsTitled(["Nuxt tips", "Vue tips", "Drizzle", "100% done"]);

    const tips = await guest().api.post.list({ q: " TIPS " });

    expect(tips.rows.map((post) => post.title).sort()).toEqual(["Nuxt tips", "Vue tips"]);
    expect(tips).toMatchObject({ total: 2, lastPage: 1 });
    expect((await guest().api.post.list({ q: "driz" })).rows.map((post) => post.title)).toEqual(["Drizzle"]);
    expect(await guest().api.post.list({ q: "missing" })).toMatchObject({ rows: [], total: 0, lastPage: 1 });
  });
});
