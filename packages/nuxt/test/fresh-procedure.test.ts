import { actingAs, expect, guest, type TestClient, travelBy } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

function callFresh(send: TestClient["fetch"] = guest().fetch) {
  return send("/api/trpc/_sessionCheck.fresh");
}

describe("freshProcedure", async () => {
  await setupPlayground();

  it("lets a sign-in from 9 minutes ago through and refuses one from 11 minutes ago", async () => {
    const client = actingAs(await userFactory({ email: "fresh-procedure@example.com" }));

    await client.fetch("/api/auth/get-session");
    await travelBy({ minutes: 9 });
    const fresh = await callFresh(client.fetch);

    expect(fresh.status).toBe(200);
    expect(await fresh.json()).toMatchObject({ result: { data: { json: "fresh-procedure@example.com" } } });

    await travelBy({ minutes: 2 });
    const stale = await callFresh(client.fetch);

    expect(stale.status).toBe(403);
    expect(await stale.json()).toMatchObject({ error: { json: { message: "Sign in again to continue", data: { code: "FORBIDDEN" } } } });
  });

  it("answers UNAUTHORIZED with no session", async () => {
    expect((await callFresh()).status).toBe(401);
  });

  it("counts an actingAs caller as a fresh sign-in", async () => {
    const user = await userFactory();

    await expect(actingAs(user).api._sessionCheck.fresh()).resolves.toBe(user.email);
  });
});
