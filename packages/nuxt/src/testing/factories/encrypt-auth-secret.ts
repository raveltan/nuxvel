import { symmetricEncrypt } from "better-auth/crypto";
import { secretVersion } from "../../runtime/server/auth/secret-version";
import { useSecrets } from "../../runtime/server/security/secrets";

/**
 * Encrypts `data` as Better Auth stores the TOTP secret and the backup
 * codes of a `two_factor` row, with the current `NUXT_AUTH_SECRET`. A
 * factory state that turns two-factor sign-in on writes the row with it.
 *
 * Throws when `NUXT_AUTH_SECRET` is not set.
 *
 * @example
 * ```ts
 * await twoFactorFactory({
 *   userId: user.id,
 *   secret: await encryptAuthSecret(TWO_FACTOR_SECRET),
 *   backupCodes: await encryptAuthSecret(JSON.stringify(TWO_FACTOR_BACKUP_CODES)),
 * });
 * ```
 */
export function encryptAuthSecret(data: string): Promise<string> {
  const [current] = useSecrets("NUXT_AUTH_SECRET");
  const version = secretVersion(current);

  return symmetricEncrypt({ key: { keys: new Map([[version, current]]), currentVersion: version }, data });
}
