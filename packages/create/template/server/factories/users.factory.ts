import { randomUUID } from "node:crypto";
import { faker } from "@faker-js/faker";
import { hashPassword } from "better-auth/crypto";
import { defineFactory, encryptAuthSecret, sequence } from "@nuxvel/nuxt/factories";
import { accountTable, twoFactorTable, userTable } from "#nuxvel/schema";

const baseUserFactory = defineFactory(userTable, {
  id: () => randomUUID(),
  name: () => faker.person.fullName(),
  email: sequence((n, user) => `${user.name.toLowerCase().replace(/[^a-z]+/g, ".")}${n}@example.com`),
});

const accountFactory = defineFactory(accountTable, { id: () => randomUUID(), providerId: "credential" });

const twoFactorFactory = defineFactory(twoFactorTable, { id: () => randomUUID() });

const passwordHashes = new Map<string, Promise<string>>();

function passwordHash(password: string) {
  const hash = passwordHashes.get(password) ?? hashPassword(password);

  passwordHashes.set(password, hash);

  return hash;
}

/**
 * The TOTP secret of each user from `userFactory.withTwoFactor()`. Give it
 * to `totpCode()` of `@nuxvel/nuxt/testing` for the current code.
 */
export const twoFactorSecret = "nuxvel-factory-two-factor-secret";

/** The backup codes of each user from `userFactory.withTwoFactor()`. */
export const twoFactorBackupCodes = ["AAAAA-11111", "BBBBB-22222", "CCCCC-33333"];

function withPassword(password: string) {
  return baseUserFactory.afterCreate(async (row) => {
    await accountFactory({ accountId: row.id, userId: row.id, password: await passwordHash(password) });
  });
}

export const userFactory = Object.assign(baseUserFactory, {
  /**
   * A user factory that also writes the credential account, so the user
   * signs in with `password`. The hash is computed once per password.
   *
   * @example
   * ```ts
   * const user = await userFactory.withPassword("secret-password")();
   * ```
   */
  withPassword,
  /**
   * A user factory for a user with two-factor sign-in on: it writes the
   * credential account of `password`, as {@link userFactory.withPassword}
   * does, and the `two_factor` row with {@link twoFactorSecret} and
   * {@link twoFactorBackupCodes}, encrypted with `NUXT_AUTH_SECRET`.
   *
   * @example
   * ```ts
   * const user = await userFactory.withTwoFactor("secret-password")();
   * await field(page, "Authentication code").fill(totpCode(twoFactorSecret));
   * ```
   */
  withTwoFactor: (password: string) =>
    withPassword(password)
      .state({ twoFactorEnabled: true })
      .afterCreate(async (row) => {
        await twoFactorFactory({
          userId: row.id,
          secret: await encryptAuthSecret(twoFactorSecret),
          backupCodes: await encryptAuthSecret(JSON.stringify(twoFactorBackupCodes)),
        });
      }),
});
