import { describe, it } from "vitest";
import { expect, expectFetched, fakeFetch } from "@nuxvel/nuxt/testing";
import { postJson } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const PASSWORD = "correct-horse-battery-staple";

describe("Turnstile on sign-up and password reset", async () => {
  await setupPlayground({ env: { NUXT_AUTH_TURNSTILE_SECRET_KEY: "turnstile-test-secret" } });

  it("refuses a sign-up without a token or with a token Turnstile rejects", async () => {
    await fakeFetch({ [SITEVERIFY]: { body: { success: false, "error-codes": ["invalid-input-response"] } } });

    const missing = await postJson("/api/auth/sign-up/email", { name: "Bot", email: "bot@example.com", password: PASSWORD });
    const rejected = await postJson(
      "/api/auth/sign-up/email",
      { name: "Bot", email: "bot@example.com", password: PASSWORD },
      { "x-captcha-response": "a-forged-token" },
    );

    expect(missing.status).toBe(400);
    expect(rejected.status).toBe(403);
    await expectFetched(SITEVERIFY, { method: "POST", times: 1 });

    const reset = await postJson("/api/auth/request-password-reset", { email: "bot@example.com" }, { "x-captcha-response": "a-forged-token" });

    expect(reset.status).toBe(403);
  });

  it("lets a sign-up with a token Turnstile accepts through", async () => {
    await fakeFetch({ [SITEVERIFY]: { body: { success: true } } });

    const response = await postJson(
      "/api/auth/sign-up/email",
      { name: "Ada", email: "human@example.com", password: PASSWORD },
      { "x-captcha-response": "a-real-token" },
    );

    expect(response.status).toBe(200);
  });
});
