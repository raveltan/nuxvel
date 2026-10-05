import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SETUP_KEY = /^[A-Z2-7]+=*$/;

function base32Bytes(encoded: string) {
  const bits = [...encoded.toUpperCase().replace(/=+$/, "")].map((char) => BASE32.indexOf(char).toString(2).padStart(5, "0")).join("");

  return Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
}

/**
 * Returns the current 6-digit code of a TOTP URI, of the base32 setup key
 * that an authenticator app is given, or of the raw TOTP secret that a
 * two-factor factory state stores, at the time of the test clock.
 *
 * Use it to finish two-factor sign-in in a test, with the `totpURI` that `twoFactor.enable()` answers,
 * the setup key a page shows (spaces are ignored), or the secret of a user from
 * `userFactory.withTwoFactor(password)`. A secret made only of base32 letters and digits
 * (upper-case A–Z and 2–7, as Better Auth shows it) is read as a setup key.
 * It follows {@link freezeTime} and {@link travelTo}, because it reads `Date.now()`.
 *
 * @example
 * ```ts
 * const { $fetch } = await signIn(user.email, password);
 * const { totpURI } = await $fetch<{ totpURI: string }>("/api/auth/two-factor/enable", { method: "POST", body: { password } });
 * await $fetch("/api/auth/two-factor/verify-totp", { method: "POST", body: { code: totpCode(totpURI) } });
 * await field(page, "Authentication code").fill(totpCode(twoFactorSecret));
 * await field(page, "Authentication code").fill(totpCode("JBSW Y3DP EHPK 3PXP"));
 * ```
 */
export function totpCode(totpUriOrSecret: string) {
  const setupKey = totpUriOrSecret.replaceAll(" ", "");
  const secret = totpUriOrSecret.startsWith("otpauth:")
    ? base32Bytes(new URL(totpUriOrSecret).searchParams.get("secret") ?? "")
    : SETUP_KEY.test(setupKey)
      ? base32Bytes(setupKey)
      : Buffer.from(totpUriOrSecret, "utf8");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 15;

  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
