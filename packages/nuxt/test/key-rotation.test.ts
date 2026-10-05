import { describe, it } from "vitest";
import { actingAs, expect, guest, totpCode } from "@nuxvel/nuxt/testing";
import { twoFactorBackupCodes, twoFactorSecret, userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

describe("auth secret rotation", async () => {
  await setupPlayground();

  it("keeps verifying old-secret sessions until the grace period ends", async () => {
    const email = "key-rotation@example.com";
    const user = await userFactory({ email });

    const body = await actingAs(user).$fetch("/api/_key-rotate-check");

    expect(body).toEqual({
      oldDuringGrace: true,
      freshDuringGrace: true,
      oldAfterGrace: false,
      freshAfterGrace: true,
    });
  });

  it("keeps two-factor sign-in working during the grace period and, once re-encrypted, after it", async () => {
    const { email } = await userFactory.withTwoFactor(PASSWORD)();

    const body = await guest().$fetch("/api/_key-rotate-two-factor-check", {
      method: "POST",
      body: { email, password: PASSWORD, code: totpCode(twoFactorSecret), backupCode: twoFactorBackupCodes[0] },
    });

    expect(body).toEqual({ totpDuringGrace: 200, reencrypted: 1, totpAfterGrace: 200, backupCodeAfterGrace: 200 });
  });
});
