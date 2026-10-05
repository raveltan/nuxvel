import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory } from "../../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../../playground/server/factories/users.factory";

describe("factory .afterCreate()", () => {
  it("runs once for each created row, with that row", async () => {
    const author = await userFactory();
    const seen: number[] = [];

    const first = await postFactory.for("authorId", author).afterCreate((post) => seen.push(post.id))();
    const second = await postFactory.afterCreate((post) => seen.push(post.id))();

    expect(seen).toEqual([first.id, second.id]);
  });

  it("runs hooks and .has() children in the order they are added", async () => {
    const order: string[] = [];

    await userFactory
      .afterCreate(() => order.push("first hook"))
      .has(1, (user) => postFactory.for("authorId", user).afterCreate(() => order.push("child")))
      .afterCreate(() => order.push("second hook"))();

    expect(order).toEqual(["first hook", "child", "second hook"]);
  });
});
