import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { expect, expectMailSent, expectQueued, expectRow, runJob } from "@nuxvel/nuxt/testing";
import { userTable } from "../../../playground/server/database/schema/auth.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";
const ON_ZH_PAGE = { "x-nuxvel-locale": "zh" };

describe("the locale of the user", async () => {
  await setupPlayground();

  it("signs up on /zh with the locale zh and gets the verify mail in Chinese", async () => {
    const email = `zh-${randomUUID()}@example.com`;

    expect((await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD }, ON_ZH_PAGE)).status).toBe(200);
    await expectRow(userTable, { email, locale: "zh" });

    expect((await postJson("/api/auth/send-verification-email", { email })).status).toBe(200);

    await expectQueued("nuxvel.mail", { to: email, subject: "请确认您的电子邮件地址" });
  });

  it("sends a user of zh the reset link and the verify link of the /zh pages", async () => {
    const email = `zh-links-${randomUUID()}@example.com`;

    await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD }, ON_ZH_PAGE);
    await postJson("/api/auth/request-password-reset", { email, redirectTo: "/reset-password" });
    await postJson("/api/auth/send-verification-email", { email, callbackURL: "/" });

    const reset = await fetch((await expectMailSent("nuxvel.auth.reset-password", { to: email })).url, { redirect: "manual" });
    const verify = await fetch((await expectMailSent("nuxvel.auth.verify-email", { to: email })).url, { redirect: "manual" });

    expect(new URL(reset.headers.get("location") ?? "").pathname).toBe("/zh/reset-password");
    expect(verify.headers.get("location")).toBe("/zh");
  });

  it("signs up without a locale with the default locale", async () => {
    const email = `en-${randomUUID()}@example.com`;

    await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD });

    await expectRow(userTable, { email, locale: "en" });
  });

  it("changes the locale with update-user, and refuses a locale that the app does not have", async () => {
    const email = `switch-${randomUUID()}@example.com`;
    const cookie = sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Ada", email, password: PASSWORD })) ?? "";

    expect((await postJson("/api/auth/update-user", { locale: "zh" }, { cookie })).status).toBe(200);
    expect((await postJson("/api/auth/update-user", { locale: "fr" }, { cookie })).status).toBe(400);
    await expectRow(userTable, { email, locale: "zh" });

    await postJson("/api/auth/request-password-reset", { email, redirectTo: "/reset-password" });

    await expectQueued("nuxvel.mail", { to: email, subject: "重置您的密码" });
  });

  it("mails a notification in the locale of the user", async () => {
    const ada = await userFactory({ name: "Ada", locale: "zh" });

    await runJob("nuxvel.notification", { userIds: [ada.id], mail: { mail: "welcome", data: { name: "Ada" } } });

    await expectQueued("nuxvel.mail", { to: ada.email, subject: "欢迎，Ada" });
  });
});
