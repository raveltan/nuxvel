import { assert, describe, it } from "vitest";
import { expect, expectMailSent, guest, travelBy } from "@nuxvel/nuxt/testing";
import { recordedEffects } from "../src/testing/recorded";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

describe("email change", async () => {
  await setupPlayground();

  it("mails an unverified address's link straight to the new address", async () => {
    const email = "old-address@example.com";
    const newEmail = "new-address@example.com";
    const cookie =
      sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: "correct-horse-battery-staple" })) ?? "";

    expect((await postJson("/api/auth/change-email", { newEmail }, { cookie })).status).toBe(200);
    const { url } = await expectMailSent("nuxvel.auth.verify-email", { to: newEmail });
    const notice = await expectMailSent("nuxvel.auth.security-notice", { to: email, change: "email" });

    expect(notice.url).toBeUndefined();

    const session = await guest().$fetch<{ user: { email: string } }>("/api/auth/get-session", { headers: { cookie } });

    expect(session.user.email).toBe(email);

    await fetch(url, { redirect: "manual", headers: { cookie } });

    const changed = await guest().$fetch<{ user: { email: string } }>("/api/auth/get-session", {
      headers: { cookie },
      query: { disableCookieCache: true },
    });

    expect(changed.user.email).toBe(newEmail);
  });

  it("asks the current address to approve the change of a verified address", async () => {
    const email = "verified-old@example.com";
    const newEmail = "verified-new@example.com";
    const cookie =
      sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: "correct-horse-battery-staple" })) ?? "";
    await postJson("/api/auth/send-verification-email", { email }, { cookie });
    const verification = await expectMailSent("nuxvel.auth.verify-email", { to: email });
    await fetch(verification.url, { redirect: "manual", headers: { cookie } });

    expect((await postJson("/api/auth/change-email", { newEmail }, { cookie })).status).toBe(200);
    const { sent } = await recordedEffects();
    expect(sent.filter((mail) => mail.name === "nuxvel.auth.verify-email" && mail.input.to === newEmail)).toEqual([]);
    const approval = await expectMailSent("nuxvel.auth.security-notice", { to: email, change: "email" });
    assert(approval.url);

    await fetch(approval.url, { redirect: "manual", headers: { cookie } });
    const { url } = await expectMailSent("nuxvel.auth.verify-email", { to: newEmail });
    const unchanged = await guest().$fetch<{ user: { email: string } }>("/api/auth/get-session", {
      headers: { cookie },
      query: { disableCookieCache: true },
    });

    expect(unchanged.user.email).toBe(email);

    await fetch(url, { redirect: "manual", headers: { cookie } });
    const changed = await guest().$fetch<{ user: { email: string } }>("/api/auth/get-session", {
      headers: { cookie },
      query: { disableCookieCache: true },
    });

    expect(changed.user.email).toBe(newEmail);
  });

  it("refuses a session older than 10 minutes", async () => {
    const email = "stale-old@example.com";
    const newEmail = "stale-new@example.com";
    const cookie =
      sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: "correct-horse-battery-staple" })) ?? "";

    await travelBy({ minutes: 11 });
    const response = await postJson("/api/auth/change-email", { newEmail }, { cookie });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
    const { sent } = await recordedEffects();
    expect(sent.filter((mail) => mail.name === "nuxvel.auth.verify-email" && mail.input.to === newEmail)).toEqual([]);
  });
});
