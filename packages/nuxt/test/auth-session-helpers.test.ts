import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("auth() / requireAuth() session helpers", async () => {
  await setupPlayground();

  it("returns null / throws for an unauthenticated request", async () => {
    const body = await guest().$fetch("/api/_auth-check");

    expect(body).toEqual({ session: null, threwUnauthenticated: true });
  });

  it("returns the session for an authenticated request", async () => {
    const email = "auth-session-helpers@example.com";
    const user = await userFactory({ email, name: "Test User" });

    const body = await actingAs(user).$fetch("/api/_auth-check");

    expect(body.session?.user?.email).toBe(email);
    expect(body.requiredMatchesSession).toBe(true);
  });

  it("carries the user's role on the session, which sign-up cannot set", async () => {
    const email = "auth-session-role@example.com";
    const password = "correct-horse-battery-staple";

    await guest().fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Role User", email, password, role: "admin" }),
    });

    const signInResponse = await guest().fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const cookie =
      signInResponse.headers
        .getSetCookie()
        .find((candidate) => candidate.includes("session_token"))
        ?.split(";")[0] ?? "";

    const body = await guest().$fetch("/api/_auth-check", { headers: { cookie } });

    expect(body.session?.user?.role).toBe("user");
  });

  it("looks the session up once per request, however many authed procedures run in it", async () => {
    const email = "auth-session-once@example.com";
    const client = actingAs(await userFactory({ email, name: "Once User" }));

    const body = await client.$fetch("/api/_session-lookup-check");

    expect(body.firstCall).toBeGreaterThan(0);
    expect(body).toMatchObject({ batchedCalls: 0, emails: [email, email, email] });

    const batch = await client.$fetch<{ result: { data: { json: string } } }[]>(
      "/api/trpc/_sessionCheck.whoami,_sessionCheck.whoami,_sessionCheck.whoami?batch=1",
    );

    expect(batch.map((entry) => entry.result.data.json)).toEqual([email, email, email]);
  });
});
