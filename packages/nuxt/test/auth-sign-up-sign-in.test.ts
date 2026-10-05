import { button, expect, guest, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("Better Auth: email + password", async () => {
  await setupPlayground({ browser: true });

  it("signs up then signs in, receiving a session cookie", async () => {
    const email = "sign-up-sign-in@example.com";
    const password = "correct-horse-battery-staple";

    const signUpResponse = await guest().fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test User", email, password }),
    });

    expect(signUpResponse.status).toBe(200);

    const signInResponse = await guest().fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    expect(signInResponse.status).toBe(200);
    expect(
      signInResponse.headers
        .getSetCookie()
        .some((cookie) => cookie.includes("session_token")),
    ).toBe(true);
  });

  it("refuses a social sign-in while nuxvel.auth.social turns no provider on", async () => {
    const response = await guest().fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "github" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "PROVIDER_NOT_FOUND" });
  });

  it("renders no social sign-in buttons while no provider is on", async () => {
    const page = await visit("/sign-in");

    await expect(button(page, "Sign in")).toBeVisible();
    await expect(button(page, /^Continue with/)).toHaveCount(0);
  });
});
