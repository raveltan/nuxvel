import { actingAs, expect, expectRefused, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("roleProcedure()", async () => {
  await setupPlayground();

  it("lets a user with one of the roles through", async () => {
    const agent = await userFactory({ role: "agent" });

    await expect(actingAs(agent).api._roleCheck.staff({ id: 7 })).resolves.toEqual({ email: agent.email, id: 7 });
  });

  it("refuses a user with another role before it reads the input, and a guest", async () => {
    await expectRefused(actingAs(await userFactory()).api._roleCheck, "FORBIDDEN");
    await expectRefused(guest().api._roleCheck, "UNAUTHORIZED");
  });

  it("refuses an API key of a user with the role unless the procedure accepts keys", async () => {
    const admin = await userFactory({ role: "admin" });
    const { key } = await actingAs(admin).api.apiKeys.create({ name: "ci" });
    const headers = { authorization: `Bearer ${key}` };

    const refused = await guest().fetch(`/api/trpc/_roleCheck.staff?input=${encodeURIComponent(JSON.stringify({ json: { id: 1 } }))}`, { headers });
    const accepted = await guest().fetch("/api/trpc/_roleCheck.withKeys", { headers });

    expect(refused.status).toBe(403);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ result: { data: { json: "api-key" } } });
  });
});
