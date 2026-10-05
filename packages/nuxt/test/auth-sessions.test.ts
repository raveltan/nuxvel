import { actingAs, expect, guest, heading } from "@nuxvel/nuxt/testing";
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
