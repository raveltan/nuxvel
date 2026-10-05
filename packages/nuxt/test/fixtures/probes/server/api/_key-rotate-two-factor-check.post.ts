import { randomBytes } from "node:crypto";
import { reencryptTwoFactor } from "../../../../../src/runtime/server/auth/reencrypt-two-factor";

const GRACE_MS = 24 * 60 * 60 * 1000;

async function secondFactorStatus(email: string, password: string, path: string, code: string): Promise<number> {
  const signIn = await $fetch.raw("/api/auth/sign-in/email", { method: "POST", body: { email, password } });
  const challenge = signIn.headers.getSetCookie().find((cookie) => cookie.includes("two_factor="))?.split(";")[0] ?? "";
  const verify = await $fetch.raw(path, { method: "POST", body: { code }, headers: { cookie: challenge }, ignoreResponseError: true });

  return verify.status;
}

export default defineEventHandler(async (event) => {
  const { email, password, code, backupCode } = await readBody<{ email: string; password: string; code: string; backupCode: string }>(event);
  const previousSecret = process.env.NUXT_AUTH_SECRET;

  try {
    process.env.NUXT_AUTH_SECRET = randomBytes(32).toString("base64url");
    process.env.NUXT_AUTH_SECRET_PREVIOUS = previousSecret;
    process.env.NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT = new Date(Date.now() + GRACE_MS).toISOString();

    const totpDuringGrace = await secondFactorStatus(email, password, "/api/auth/two-factor/verify-totp", code);
    const reencrypted = await reencryptTwoFactor();

    process.env.NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT = new Date(Date.now() - GRACE_MS).toISOString();

    const totpAfterGrace = await secondFactorStatus(email, password, "/api/auth/two-factor/verify-totp", code);
    const backupCodeAfterGrace = await secondFactorStatus(email, password, "/api/auth/two-factor/verify-backup-code", backupCode);

    return { totpDuringGrace, reencrypted, totpAfterGrace, backupCodeAfterGrace };
  } finally {
    process.env.NUXT_AUTH_SECRET = previousSecret;
    delete process.env.NUXT_AUTH_SECRET_PREVIOUS;
    delete process.env.NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT;
  }
});
