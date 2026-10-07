import { describe, it } from "vitest";
import { actingAs, expect, expectCount } from "@nuxvel/nuxt/testing";
import { postsTable } from "../../../playground/server/database/schema/posts.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

const JSON_HEADERS = { "content-type": "application/json" };
const body = JSON.stringify({ title: "Hello", body: "" });

describe("actingAs(user, options)", async () => {
  await setupPlayground();

  it("sends the Idempotency-Key header with a tRPC call", async () => {
    const ada = actingAs(await userFactory(), { headers: { "Idempotency-Key": "k1" } });

    const first = await ada.api.post.create({ title: "Hello", body: "" });
    const second = await ada.api.post.create({ title: "Hello", body: "" });

    expect(second.id).toBe(first.id);
    await expectCount(postsTable, 1);
  });

  it("sends the headers with fetch, and a header of the call wins", async () => {
    const ada = actingAs(await userFactory(), { headers: { "Idempotency-Key": "k1" } });
    const post = (headers: Record<string, string> = {}) =>
      ada.fetch("/api/v1/posts", { method: "POST", headers: { ...JSON_HEADERS, ...headers }, body }).then((r) => r.json());

    const first = await post();
    const second = await post();
    const third = await post({ "Idempotency-Key": "k2" });

    expect(second.id).toBe(first.id);
    expect(third.id).not.toBe(first.id);
    await expectCount(postsTable, 2);
  });
});
