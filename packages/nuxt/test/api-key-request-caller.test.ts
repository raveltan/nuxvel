import { describe, it } from "vitest";
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("the caller of a request signed with an API key", async () => {
  await setupPlayground();

  it("is looked up once per request, however many policy checks read it", async () => {
    const body = await actingAs(await userFactory(), { apiKey: true }).$fetch("/api/_api-key-can-check");

    expect(body).toEqual({ lookups: 1, lastUsedUpdates: 1 });
  });

  it("spends the key's api-key rate limit once for each call of a batch", async () => {
    const user = await userFactory();
    const { key, id } = await actingAs(user).api.apiKeys.create({ name: "batch" });

    const batch = await guest().fetch("/api/trpc/_sessionCheck.whoami,_sessionCheck.whoami,_sessionCheck.whoami?batch=1", {
      headers: { authorization: `Bearer ${key}` },
    });
    const { left } = await guest().$fetch(`/api/_api-key-points-check?id=${id}`);

    expect(batch.status).toBe(200);
    expect(left).toBe(60 - 3 - 1);
  });
});
