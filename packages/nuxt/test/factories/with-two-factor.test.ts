import { expect, guest, totpCode } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { twoFactorBackupCodes, twoFactorSecret, userFactory } from "../../../../playground/server/factories/users.factory";
import { setupPlayground } from "../helpers/playground";

describe("userFactory.withTwoFactor()", async () => {
  await setupPlayground();

  it("turns two-factor sign-in on with twoFactorSecret and twoFactorBackupCodes", async () => {
    const user = await userFactory.withTwoFactor("secret-password")();
    const post = (path: string, body: Record<string, unknown>, cookie = "") =>
      guest().fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(body),
      });
    const cookieNamed = (response: Response, name: string) =>
      response.headers
        .getSetCookie()
        .find((cookie) => new RegExp(`${name}=[^;]`).test(cookie))
        ?.split(";")[0];
    const signIn = () => post("/api/auth/sign-in/email", { email: user.email, password: "secret-password" });

    expect(user.twoFactorEnabled).toBe(true);

    const password = await signIn();

    expect(await password.json()).toMatchObject({ twoFactorRedirect: true });
    expect(cookieNamed(password, "session_token")).toBeUndefined();

    const totp = await post("/api/auth/two-factor/verify-totp", { code: totpCode(twoFactorSecret) }, cookieNamed(password, "two_factor"));

    expect(totp.status).toBe(200);
    expect(cookieNamed(totp, "session_token")).toBeDefined();

    const again = await signIn();
    const backup = await post("/api/auth/two-factor/verify-backup-code", { code: twoFactorBackupCodes[0] }, cookieNamed(again, "two_factor"));

    expect(backup.status).toBe(200);
    expect(cookieNamed(backup, "session_token")).toBeDefined();
  });
});
