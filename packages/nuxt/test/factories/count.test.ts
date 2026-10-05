import { expect } from "@nuxvel/nuxt/testing";
import { inArray, sql } from "drizzle-orm";
import { describe, it } from "vitest";
import { postsTable } from "../../../../playground/server/database/schema/posts.schema";
import { postFactory } from "../../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../../playground/server/factories/users.factory";
import { useTestDatabase } from "../helpers/database";

describe("factory .count()", () => {
  const db = useTestDatabase();

  it("inserts n rows in one INSERT ... RETURNING", async () => {
    const author = await userFactory();
    const seen: number[] = [];

    const created = await postFactory
      .for("authorId", author)
      .afterCreate((post) => seen.push(post.id))
      .count(10)({ body: "Batch" });
    const [inserts] = await db
      .select({ transactions: sql<number>`count(distinct ${postsTable}.xmin::text)::int` })
      .from(postsTable)
      .where(inArray(postsTable.id, created.map((post) => post.id)));

    expect(created).toHaveLength(10);
    expect(new Set(created.map((post) => post.title)).size).toBe(10);
    expect(created.every((post) => post.body === "Batch" && post.authorId === author.id)).toBe(true);
    expect(inserts?.transactions).toBe(1);
    expect(seen).toEqual(created.map((post) => post.id));
  });

  it("inserts nothing for a count of 0", async () => {
    expect(await postFactory.count(0)()).toEqual([]);
  });
});
