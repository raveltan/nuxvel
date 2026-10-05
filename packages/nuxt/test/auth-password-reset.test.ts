import { request } from "node:http";
import { describe, it } from "vitest";
import { startServer, stopServer, url as serverUrl } from "@nuxt/test-utils/e2e";
import { expect, expectMailSent, guest } from "@nuxvel/nuxt/testing";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";
const NEW_PASSWORD = "a-brand-new-long-passphrase";

function postWithHost(path: string, host: string, body: Record<string, unknown>) {
  return new Promise<number>((resolve, reject) => {
    const sent = request(serverUrl(path), { method: "POST", headers: { host, "content-type": "application/json" } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    sent.on("error", reject);
    sent.end(JSON.stringify(body));
  });
}

describe("password reset", async () => {
  await setupPlayground();

  it("resets the password with a single-use link, signs out every session and confirms by mail", async () => {
    const email = "forgetful@example.com";

    const signUp = await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD });
    const otherDevice = sessionCookie(await postJson("/api/auth/sign-in/email", { email, password: PASSWORD }));

    expect((await postJson("/api/auth/request-password-reset", { email, redirectTo: "/reset-password" })).status).toBe(200);
    const { url } = await expectMailSent("nuxvel.auth.reset-password", { to: email, name: "Ada" });

    const link = await fetch(url, { redirect: "manual" });
    const target = new URL(link.headers.get("location") ?? "");
    const token = target.searchParams.get("token") ?? "";

    expect(target.pathname).toBe("/reset-password");

    const reset = await postJson("/api/auth/reset-password", { token, newPassword: NEW_PASSWORD });

    expect(reset.status).toBe(200);
    await expectMailSent("nuxvel.auth.security-notice", { to: email, change: "password" });

    for (const cookie of [sessionCookie(signUp), otherDevice]) {
      expect(await guest().$fetch("/api/auth/get-session", { headers: { cookie: cookie ?? "" } })).toBeNull();
    }

    const reused = await postJson("/api/auth/reset-password", { token, newPassword: "yet-another-passphrase" });

    expect(reused.status).toBe(400);
    expect((await postJson("/api/auth/sign-in/email", { email, password: NEW_PASSWORD })).status).toBe(200);
  });

  it("mails the reset link on NUXT_SITE_URL, whatever Host header the request sends", async () => {
    await stopServer();

    try {
      await startServer({ env: { NUXT_SITE_URL: "https://app.example.test" } });
      const email = "hostile-host@example.com";

      await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD });
      expect(await postWithHost("/api/auth/request-password-reset", "evil.example", { email, redirectTo: "/reset-password" })).toBe(200);
      const { url: link } = await expectMailSent("nuxvel.auth.reset-password", { to: email });

      expect(link).toMatch(/^https:\/\/app\.example\.test\/api\/auth\/reset-password\//);
    } finally {
      await stopServer();
      await startServer();
    }
  }, 120000);
});
