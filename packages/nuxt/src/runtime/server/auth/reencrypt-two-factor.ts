import { type SecretConfig, symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { and, eq, like, or } from "drizzle-orm";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { useSecrets } from "../security/secrets";
import { secretVersion } from "./secret-version";

async function reencrypt(key: SecretConfig, data: string) {
  return symmetricEncrypt({ key, data: await symmetricDecrypt({ key, data }) });
}

/**
 * Encrypts again, with the current `NUXT_AUTH_SECRET`, the TOTP secret and
 * backup codes of every `two_factor` row that a previous secret encrypted,
 * and returns how many rows it changed.
 *
 * The built-in `nuxvel.auth.reencrypt-two-factor` schedule runs it every
 * day at 04:15 in `nuxvel queue:work`. It does nothing when no previous
 * secret is inside its grace period. It skips a row that changed while it ran;
 * the next run takes it.
 */
export async function reencryptTwoFactor(): Promise<number> {
  const [current, ...previous] = useSecrets("NUXT_AUTH_SECRET");
  const key: SecretConfig = {
    keys: new Map([current, ...previous].map((value) => [secretVersion(value), value])),
    currentVersion: secretVersion(current),
  };
  const twoFactor = schemaTable("two_factor");
  const db = useDb({ root: true });
  let changed = 0;

  for (const secret of previous) {
    const prefix = `$ba$${secretVersion(secret)}$%`;
    const rows = await db.select().from(twoFactor).where(or(like(twoFactor.secret, prefix), like(twoFactor.backupCodes, prefix)));

    for (const row of rows) {
      const updated = await db
        .update(twoFactor)
        .set({ secret: await reencrypt(key, row.secret), backupCodes: await reencrypt(key, row.backupCodes) })
        .where(and(eq(twoFactor.id, row.id), eq(twoFactor.secret, row.secret), eq(twoFactor.backupCodes, row.backupCodes)))
        .returning({ id: twoFactor.id });
      changed += updated.length;
    }
  }

  return changed;
}
