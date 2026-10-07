import { describe, it } from "vitest";
import { actingAs, expect, expectAudited, expectRow, guest } from "@nuxvel/nuxt/testing";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("full-text search", async () => {
  await setupPlayground();

  it("keeps a weighted, stemmed search vector on every write", async () => {
    const post = await postFactory({ title: "Running tips", body: "How to run fast" });

    expect(post.searchVector).toBe("'fast':6B 'run':1A,5B 'tip':2A");
  });

  it("leaves the search vector out of the audited diff", async () => {
    const author = await userFactory();
    const post = await postFactory({ title: "Draft", body: "Body", authorId: author.id });

    await actingAs(author).api.post.update({ id: post.id, title: "Final", body: "Body" });

    const row = await expectAudited("post.updated", { targetId: String(post.id) });
    expect(row.changes).toEqual({ title: { from: "Draft", to: "Final" } });
  });

  it("finds posts by stemmed words and prefixes, best match first", async () => {
    const inBody = await postFactory({ title: "Weekly notes", body: "I run every morning" });
    const inTitle = await postFactory({ title: "Running shoes", body: "A review" });
    await postFactory({ title: "Cooking", body: "Bread and soup" });
    const { api } = guest();

    const titles = async (q: string) => (await api.post.list({ q })).rows.map((post) => post.title);

    expect(await titles("running")).toEqual([inTitle.title, inBody.title]);
    expect(await titles("sho")).toEqual([inTitle.title]);
    expect(await titles("run -shoes")).toEqual([inBody.title]);
    expect(await titles("")).toHaveLength(3);
  });

  it("treats SQL in the query as search text", async () => {
    const post = await postFactory({ title: "Drop a table of posts", body: "" });

    const list = await guest().api.post.list({ q: "'; drop table posts; --" });

    expect(list.rows.map((row) => row.id)).toEqual([post.id]);
    await expectRow(postsTable, { id: post.id });
  });

  it("highlights matches in an escaped snippet", async () => {
    await postFactory({ title: "Tips", body: "<script>alert(1)</script> Running & jumping" });

    const rows = await guest().$fetch<{ snippet: string }[]>("/api/_highlight-check", { query: { q: "run" } });

    expect(rows.map((row) => row.snippet)).toEqual([
      "&lt;script&gt;alert(1)&lt;/script&gt; <mark>Running</mark> &amp; jumping",
    ]);
  });
});
