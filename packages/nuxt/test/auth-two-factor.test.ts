import { describe, it } from "vitest";
import { expect, expectMailSent, guest, totpCode } from "@nuxvel/nuxt/testing";
import { postJson, sessionCookie, signUpWithTwoFactor } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

function cookieNamed(response: Response, name: string) {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.includes(`${name}=`))
    ?.split(";")[0];
}

describe("two-factor sign-in", async () => {
  await setupPlayground();

  it("asks a user with two-factor on for a valid TOTP or backup code", async () => {
    const email = "two-factor@example.com";
    const { totpURI, backupCodes } = await signUpWithTwoFactor(email, PASSWORD);

    const password = await postJson("/api/auth/sign-in/email", { email, password: PASSWORD });
    const challenge = cookieNamed(password, "two_factor") ?? "";

    expect(await password.json()).toMatchObject({ twoFactorRedirect: true });
    expect(sessionCookie(password)).toBeUndefined();

    const wrong = await postJson("/api/auth/two-factor/verify-totp", { code: "000000" }, { cookie: challenge });

    expect(wrong.status).toBe(401);

    const right = await postJson("/api/auth/two-factor/verify-totp", { code: totpCode(totpURI) }, { cookie: challenge });

    expect(right.status).toBe(200);
    expect(sessionCookie(right)).toBeDefined();

    const again = await postJson("/api/auth/sign-in/email", { email, password: PASSWORD });
    const backup = await postJson(
      "/api/auth/two-factor/verify-backup-code",
      { code: backupCodes[0] },
      { cookie: cookieNamed(again, "two_factor") ?? "" },
    );

    expect(backup.status).toBe(200);
    expect(sessionCookie(backup)).toBeDefined();
  });

  it("accepts the code of the base32 setup key that an authenticator app is given", async () => {
    const email = "two-factor-setup-key@example.com";
    const { totpURI } = await signUpWithTwoFactor(email, PASSWORD);
    const setupKey = new URL(totpURI).searchParams.get("secret") ?? "";
    const grouped = setupKey.match(/.{1,4}/g)?.join(" ") ?? "";
    const codes = { uri: totpCode(totpURI), key: totpCode(setupKey), grouped: totpCode(grouped) };

    const password = await postJson("/api/auth/sign-in/email", { email, password: PASSWORD });
    const verified = await postJson(
      "/api/auth/two-factor/verify-totp",
      { code: codes.grouped },
      { cookie: cookieNamed(password, "two_factor") ?? "" },
    );

    expect(codes).toEqual({ uri: codes.uri, key: codes.uri, grouped: codes.uri });
    expect(verified.status).toBe(200);
  });

  it("asks for the second factor when an email link starts the session", async () => {
    const email = "link-two-factor@example.com";
    const { totpURI } = await signUpWithTwoFactor(email, PASSWORD);

    await postJson("/api/auth/send-verification-email", { email, callbackURL: "/" });
    const { url } = await expectMailSent("nuxvel.auth.verify-email", { to: email });
    const opened = await fetch(url, { redirect: "manual" });

    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toMatch(/\/sign-in\?twoFactor=true$/);
    expect(sessionCookie(opened)).toBeUndefined();

    const challenge = cookieNamed(opened, "two_factor") ?? "";
    const verified = await postJson("/api/auth/two-factor/verify-totp", { code: totpCode(totpURI) }, { cookie: challenge });

    expect(sessionCookie(verified)).toBeDefined();
  });

  it("asks for the second factor when an email change link starts the session", async () => {
    const email = "change-two-factor@example.com";
    const newEmail = "change-two-factor-new@example.com";
    const { cookie } = await signUpWithTwoFactor(email, PASSWORD);

    await postJson("/api/auth/change-email", { newEmail, callbackURL: "/" }, { cookie });
    const { url } = await expectMailSent("nuxvel.auth.verify-email", { to: newEmail });
    const opened = await fetch(url, { redirect: "manual" });

    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toMatch(/\/sign-in\?twoFactor=true$/);
    expect(sessionCookie(opened)).toBeUndefined();
    expect(cookieNamed(opened, "two_factor")).toBeDefined();
  });

  it("keeps the session of a signed-in user who opens the link", async () => {
    const email = "link-signed-in@example.com";
    const { cookie } = await signUpWithTwoFactor(email, PASSWORD);

    await postJson("/api/auth/send-verification-email", { email, callbackURL: "/" });
    const { url } = await expectMailSent("nuxvel.auth.verify-email", { to: email });
    await fetch(url, { redirect: "manual", headers: { cookie } });

    const session = await guest().$fetch<{ user: { email: string } } | null>("/api/auth/get-session", {
      headers: { cookie },
      query: { disableCookieCache: true },
    });

    expect(session?.user.email).toBe(email);
  });
});
