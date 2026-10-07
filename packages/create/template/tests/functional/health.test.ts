import { describe, expect, expectMailSent, expectRow, guest, it } from "@nuxvel/nuxt/testing";
import { userTable } from "#nuxvel/schema";
import { userFactory } from "#nuxvel/factories";

describe("the app", () => {
  it("reaches its database and Redis", async () => {
    const body = await guest().$fetch("/api/health/ready");

    expect(body).toMatchObject({ database: "reachable", redis: "reachable" });
  });

  it("signs a new user up", async () => {
    const email = "ada@example.com";

    const signUp = await guest().fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada", email, password: "correct-horse-battery" }),
    });

    expect(signUp.status).toBe(200);
    await expectRow(userTable, { email, name: "Ada" });
  });

  it("answers a missing page with status 404", async () => {
    const response = await guest().fetch("/no-such-page", { headers: { accept: "text/html" } });

    expect(response.status).toBe(404);
  });

  it("sends a reset link", async () => {
    const email = "grace@example.com";

    await userFactory({ name: "Grace", email });

    const requested = await guest().fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
    });

    expect(requested.status).toBe(200);
    await expectMailSent("nuxvel.auth.reset-password", { to: email });
  });
});
