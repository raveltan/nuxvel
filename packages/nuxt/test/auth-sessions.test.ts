import { actingAs, button, expect, expectMailSent, field, guest, heading, text, totpCode } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

interface ListedSession {
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  updatedAt: string;
}

describe("session list", async () => {
  await setupPlayground({ browser: true });

  it("lists each session with its device and last activity, and revoking one signs it out", async () => {
    const email = "two-devices@example.com";
    const laptop = sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD })) ?? "";
    const phone =
      sessionCookie(await postJson("/api/auth/sign-in/email", { email, password: PASSWORD }, { "user-agent": "Phone/1.0" })) ?? "";

    const sessions = await guest().$fetch<ListedSession[]>("/api/auth/list-sessions", { headers: { cookie: laptop } });
    const onPhone = sessions.find((session) => session.userAgent === "Phone/1.0");

    expect(sessions).toHaveLength(2);
    expect(onPhone).toMatchObject({ ipAddress: expect.any(String), updatedAt: expect.any(String) });

    const revoked = await postJson("/api/auth/revoke-session", { token: onPhone?.token }, { cookie: laptop });

    expect(revoked.status).toBe(200);
    expect(await guest().$fetch("/api/auth/get-session", { headers: { cookie: phone } })).toBeNull();
    expect(await guest().$fetch("/api/auth/get-session", { headers: { cookie: laptop } })).not.toBeNull();
  });

  it("shows where the user is signed in on the security page", async () => {
    const user = await userFactory({ email: "security-page@example.com", name: "Ada" });
    const page = await actingAs(user).visit("/security");

    await expect(heading(page, "Where you are signed in")).toBeVisible();
  });

  it("leaves the session tokens out of the server-rendered security page", async () => {
    const client = actingAs(await userFactory({ email: "security-html@example.com" }));
    const html = await client.$fetch<string>("/security");
    const sessions = await client.$fetch<ListedSession[]>("/api/auth/list-sessions");

    expect(sessions).toHaveLength(1);
    for (const { token } of sessions) expect(html).not.toContain(token);
  });

  it("signs out another session from the security page", async () => {
    const user = await userFactory.withPassword(PASSWORD)({ email: "security-revoke@example.com" });
    const phone =
      sessionCookie(await postJson("/api/auth/sign-in/email", { email: user.email, password: PASSWORD }, { "user-agent": "Phone/1.0" })) ?? "";
    const page = await actingAs(user).visit("/security");
    const row = page.getByRole("listitem").filter({ hasText: "Phone/1.0" });

    await button(row, "Sign out").click();

    await expect(row).toHaveCount(0);
    expect(await guest().$fetch("/api/auth/get-session", { headers: { cookie: phone } })).toBeNull();
  });

  it("turns on two-factor sign-in from the security page, after a refused password", async () => {
    const user = await userFactory.withPassword(PASSWORD)({ email: "security-two-factor@example.com" });
    const page = await actingAs(user).visit("/security");

    await field(page, "Current password").fill("a-wrong-password");
    await button(page, "Turn on").click();
    await expect(text(page, "Invalid password")).toBeVisible();

    await field(page, "Current password").fill(PASSWORD);
    await button(page, "Turn on").click();
    const totpURI = (await page.locator("code").textContent()) ?? "";
    await field(page, "Authentication code").fill(totpCode(totpURI));
    await button(page, "Confirm").click();

    await expect(text(page, "Two-factor sign-in is on.")).toBeVisible();
  });

  it("asks for an email change from the security page", async () => {
    const user = await userFactory({ email: "security-email@example.com" });
    const page = await actingAs(user).visit("/security");

    await field(page, "New email address").fill("security-email-new@example.com");
    await button(page, "Change").click();

    await expect(text(page, "Open the link in the mail we sent you.")).toBeVisible();
    await expectMailSent("nuxvel.auth.verify-email", { to: "security-email-new@example.com" });
  });

  it("ends every other session on a password change, and keeps the session that changed it", async () => {
    const email = "stolen-session@example.com";
    const laptop = sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD })) ?? "";
    const phone = sessionCookie(await postJson("/api/auth/sign-in/email", { email, password: PASSWORD })) ?? "";
    const before = await guest().$fetch<{ session: { id: string } }>("/api/auth/get-session", { headers: { cookie: phone } });

    const changed = await postJson(
      "/api/auth/change-password",
      { currentPassword: PASSWORD, newPassword: "a-brand-new-long-passphrase" },
      { cookie: phone },
    );

    expect(changed.status).toBe(200);
    expect(await guest().$fetch("/api/auth/get-session", { headers: { cookie: laptop } })).toBeNull();
    const after = await guest().$fetch<{ session: { id: string } }>("/api/auth/get-session", { headers: { cookie: phone } });
    expect(after.session.id).toBe(before.session.id);
  });

  it("keeps the new session when the change also asks to revoke other sessions", async () => {
    const email = "revoke-others@example.com";
    const first = sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD })) ?? "";
    const other = sessionCookie(await postJson("/api/auth/sign-in/email", { email, password: PASSWORD })) ?? "";

    const changed = await postJson(
      "/api/auth/change-password",
      { currentPassword: PASSWORD, newPassword: "a-brand-new-long-passphrase", revokeOtherSessions: true },
      { cookie: first },
    );
    const renewed = sessionCookie(changed) ?? "";

    expect(changed.status).toBe(200);
    expect(await guest().$fetch("/api/auth/get-session", { headers: { cookie: renewed } })).not.toBeNull();
    expect(await guest().$fetch("/api/auth/get-session", { headers: { cookie: other } })).toBeNull();
  });
});
