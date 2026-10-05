import { describe, it } from "vitest";
import { expect, renderMail } from "@nuxvel/nuxt/testing";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";

describe("user.name input", async () => {
  await setupPlayground();

  it("refuses a name longer than 200 characters on sign-up", async () => {
    const refused = await postJson("/api/auth/sign-up/email", {
      name: "a".repeat(201),
      email: "name-long@example.com",
      password: PASSWORD,
    });

    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "NAME_TOO_LONG" });

    const accepted = await postJson("/api/auth/sign-up/email", {
      name: "a".repeat(200),
      email: "name-limit@example.com",
      password: PASSWORD,
    });

    expect(accepted.status).toBe(200);
  });

  it("refuses a name longer than 200 characters on update-user", async () => {
    const cookie =
      sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Eve", email: "name-update@example.com", password: PASSWORD })) ??
      "";

    const refused = await postJson("/api/auth/update-user", { name: "a".repeat(201) }, { cookie });

    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "NAME_TOO_LONG" });
  });

  it("the auth mails print at most 200 characters of the name", async () => {
    const { html } = await renderMail("nuxvel.auth.reset-password", {
      to: "ada@example.com",
      name: "a".repeat(20_000),
      url: "https://example.com/reset-password/x",
    });

    expect(html).toContain("a".repeat(200));
    expect(html).not.toContain("a".repeat(201));
  });

  it("refuses a verify-email url longer than 2048 characters", async () => {
    await expect(
      renderMail("nuxvel.auth.verify-email", {
        to: "ada@example.com",
        url: `https://example.com/?c=${"'".repeat(20_000)}`,
      }),
    ).rejects.toThrow();
  });
});
