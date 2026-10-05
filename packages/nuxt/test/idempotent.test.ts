import { actingAs, expect, expectCount, type TestClient } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function createPost(send: TestClient["fetch"], title: string, idempotencyKey?: string) {
  const response = await send("/api/trpc/post.create", {
    method: "POST",
    headers: { "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
    body: JSON.stringify({ json: { title, body: "" } }),
  });
  const body: { result: { data: { json: { id: number; title: string } } } } = await response.json();

  return body.result.data.json;
}

describe("idempotent()", async () => {
  await setupPlayground();

  it("creates one row for two calls with one key, and returns the first result to both", async () => {
    const author = actingAs(await userFactory({ email: "idempotent@example.com" }));

    const first = await createPost(author.fetch, "Hello", "key-1");
    const repeat = await createPost(author.fetch, "Hello", "key-1");

    expect(repeat).toEqual(first);
    await expectCount(postsTable, 1);
  });

  it("runs again for another key, other input or no key", async () => {
    const author = actingAs(await userFactory({ email: "idempotent-other@example.com" }));

    await createPost(author.fetch, "Hello", "key-1");
    await createPost(author.fetch, "Hello", "key-2");
    await createPost(author.fetch, "Other title", "key-1");
    await createPost(author.fetch, "Hello");

    await expectCount(postsTable, 4);
  });
});
