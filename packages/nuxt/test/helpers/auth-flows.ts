import { guest } from "@nuxvel/nuxt/testing";
import { totpCode } from "../../src/testing/totp-code";

export function postJson(path: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return guest().fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .find((cookie) => /session_token=[^;]/.test(cookie))
    ?.split(";")[0];
}

export async function signUpWithTwoFactor(email: string, password: string) {
  const signUp = await postJson("/api/auth/sign-up/email", { name: "Ada", email, password });
  const enable = await postJson("/api/auth/two-factor/enable", { password }, { cookie: sessionCookie(signUp) ?? "" });
  const { totpURI, backupCodes }: { totpURI: string; backupCodes: string[] } = await enable.json();
  const cookie = sessionCookie(enable) ?? sessionCookie(signUp) ?? "";
  const confirm = await postJson("/api/auth/two-factor/verify-totp", { code: totpCode(totpURI) }, { cookie });

  if (!confirm.ok) throw new Error(`turning two-factor on answered ${confirm.status}`);

  return { totpURI, backupCodes, cookie: sessionCookie(confirm) ?? cookie };
}
