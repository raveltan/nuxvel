import { describe, it } from "vitest";
import { expect, expectMailSent } from "@nuxvel/nuxt/testing";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

describe("email verification in a production build", async () => {
  await setupPlayground({ env: { NUXT_AUTH_REQUIRE_EMAIL_VERIFICATION: "true" } });

  it("refuses a password sign-in with 403 until the link in the mail is opened", async () => {
    const email = "unverified@example.com";

    const signUp = await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD });

    expect(signUp.status).toBe(200);
    expect(sessionCookie(signUp)).toBeUndefined();
    const { url } = await expectMailSent("nuxvel.auth.verify-email", { to: email });

    const refused = await postJson("/api/auth/sign-in/email", { email, password: PASSWORD });

    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

    const verified = await fetch(url, { redirect: "manual" });

    expect(verified.status).toBe(302);
    expect(sessionCookie(verified)).toBeDefined();
    expect((await postJson("/api/auth/sign-in/email", { email, password: PASSWORD })).status).toBe(200);
  });

  it("sends the verification mail again at most 3 times an hour", async () => {
    const email = "resend@example.com";

    await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      statuses.push((await postJson("/api/auth/send-verification-email", { email })).status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
