import { describe, it } from "vitest";
import { expect, expectMailSent } from "@nuxvel/nuxt/testing";
import { recordedEffects } from "../src/testing/recorded";
import { postJson, sessionCookie, signUpWithTwoFactor } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

function knownDeviceCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.includes("known_device="))
    ?.split(";")[0];
}

async function noticesTo(email: string, change: string) {
  const { sent } = await recordedEffects();

  return sent.filter((mail) => mail.name === "nuxvel.auth.security-notice" && mail.input.to === email && mail.input.change === change);
}

describe("security notices", async () => {
  await setupPlayground();

  it("mails the user after a password change", async () => {
    const email = "changer@example.com";
    const cookie = sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD })) ?? "";

    const changed = await postJson(
      "/api/auth/change-password",
      { currentPassword: PASSWORD, newPassword: "a-brand-new-long-passphrase" },
      { cookie },
    );

    expect(changed.status).toBe(200);
    await expectMailSent("nuxvel.auth.security-notice", { to: email, name: "Ada", change: "password" });
  });

  it("mails the user on a sign-in from a new device, and not from a known one", async () => {
    const email = "traveller@example.com";
    const known = knownDeviceCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD })) ?? "";

    await postJson("/api/auth/sign-in/email", { email, password: PASSWORD }, { cookie: known });

    expect(await noticesTo(email, "new-sign-in")).toEqual([]);

    await postJson("/api/auth/sign-in/email", { email, password: PASSWORD }, { "user-agent": "Unknown Tablet" });

    expect(await noticesTo(email, "new-sign-in")).toEqual([
      expect.objectContaining({ input: expect.objectContaining({ device: "Unknown Tablet" }) }),
    ]);
  });

  it("cuts the device of a new-device notice to 200 characters", async () => {
    const email = "long-agent@example.com";

    await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD });
    await postJson("/api/auth/sign-in/email", { email, password: PASSWORD }, { "user-agent": "x".repeat(1000) });

    const [notice] = await noticesTo(email, "new-sign-in");

    expect(notice?.input.device).toHaveLength(200);
  });

  it("mails the user when two-factor sign-in turns on and off", async () => {
    const email = "careful@example.com";
    const { cookie } = await signUpWithTwoFactor(email, PASSWORD);

    await expectMailSent("nuxvel.auth.security-notice", { to: email, change: "two-factor-on" });

    expect((await postJson("/api/auth/two-factor/disable", { password: PASSWORD }, { cookie })).status).toBe(200);
    await expectMailSent("nuxvel.auth.security-notice", { to: email, change: "two-factor-off" });
  });
});
