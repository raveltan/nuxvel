import { sql } from "drizzle-orm";
import { describe, it } from "vitest";
import { expect, expectMailSent, renderMail } from "@nuxvel/nuxt/testing";
import { recordedEffects } from "../src/testing/recorded";
import { postJson } from "./helpers/auth-flows";
import { useTestDatabase } from "./helpers/database";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

async function answer(response: Response) {
  const body: unknown = await response.json();
  const user = typeof body === "object" && body !== null && "user" in body ? body.user : undefined;
  const fields = typeof user === "object" && user !== null ? Object.keys(user).sort() : [];

  return { status: response.status, body: { ...(body ?? {}), user: fields } };
}

describe("account enumeration in a production build", async () => {
  await setupPlayground({ env: { NUXT_AUTH_REQUIRE_EMAIL_VERIFICATION: "true" } });
  const db = useTestDatabase();

  it("answers a sign-up with a registered email like a new one and mails the owner", async () => {
    const email = "taken@example.com";

    const first = await answer(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD }));
    const again = await answer(await postJson("/api/auth/sign-up/email", { name: "Eve", email, password: "eves-own-long-password" }));
    const fresh = await answer(
      await postJson("/api/auth/sign-up/email", { name: "Bob", email: "fresh@example.com", password: PASSWORD }),
    );

    expect(again).toEqual(fresh);
    expect(first).toEqual(fresh);
    await expectMailSent("nuxvel.auth.existing-account", { to: email });
  });

  it("mails an address without the sign-up name, and at most one existing-account mail an hour", async () => {
    const email = "lure@example.com";
    const name = "Ada. URGENT: restore access at https://evil.example/restore";

    for (const _ of [1, 2, 3]) await postJson("/api/auth/sign-up/email", { name, email, password: PASSWORD });

    const { sent } = await recordedEffects();
    const toVictim = sent.filter((mail) => mail.input.to === email);

    expect(toVictim.map((mail) => [mail.name, Object.keys(mail.input).sort()])).toEqual([
      ["nuxvel.auth.verify-email", ["to", "url"]],
      ["nuxvel.auth.existing-account", ["to"]],
    ]);
  });

  it("renders the verification and existing-account mails without a name", async () => {
    const existing = await renderMail("nuxvel.auth.existing-account", { to: "ada@example.com" });
    const verify = await renderMail("nuxvel.auth.verify-email", { to: "ada@example.com", url: "https://example.com/v?t=1" });

    expect(existing.text).toContain("Hi, someone tried");
    expect(verify.text).toContain("Hi, open the link");
  });

  it("answers a sign-in and a reset request the same whether the email is registered or not", async () => {
    const email = "known@example.com";

    await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD });

    const known = await postJson("/api/auth/sign-in/email", { email, password: "not-the-password" });
    const unknown = await postJson("/api/auth/sign-in/email", { email: "nobody@example.com", password: "not-the-password" });

    expect([known.status, await known.json()]).toEqual([unknown.status, await unknown.json()]);

    const knownReset = await postJson("/api/auth/request-password-reset", { email });
    const unknownReset = await postJson("/api/auth/request-password-reset", { email: "nobody@example.com" });

    expect([knownReset.status, await knownReset.json()]).toEqual([unknownReset.status, await unknownReset.json()]);
  });

  it("answers a reset request before its mail is sent", async () => {
    const email = "slow-mail@example.com";

    await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD });
    await expectMailSent("nuxvel.auth.verify-email", { to: email });

    let responded = false;

    await db.transaction(async (tx) => {
      await tx.execute(sql`lock table mail_suppressions in access exclusive mode`);
      void postJson("/api/auth/request-password-reset", { email }).then((response) => {
        responded = response.ok;
      });

      await expect.poll(() => responded, { timeout: 2_000 }).toBe(true);
    });

    await expectMailSent("nuxvel.auth.reset-password", { to: email });
  });
});
