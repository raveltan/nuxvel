import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

describe("nuxvel.auth.blockDisposableEmails", async () => {
  await setupPlayground();

  it("refuses a sign-up with a disposable domain and accepts a regular one", async () => {
    const refused = await postJson("/api/auth/sign-up/email", { name: "Bot", email: "bot@mailinator.com", password: PASSWORD });

    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "DISPOSABLE_EMAIL" });
    expect((await postJson("/api/auth/sign-up/email", { name: "Ada", email: "ada@example.com", password: PASSWORD })).status).toBe(200);
  });

  it("refuses an email change to a disposable domain", async () => {
    const cookie =
      sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email: "mover@example.com", password: PASSWORD })) ?? "";

    const refused = await postJson("/api/auth/change-email", { newEmail: "mover@mailinator.com" }, { cookie });

    expect(refused.status).toBe(400);
  });
});
