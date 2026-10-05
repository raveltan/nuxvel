import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { expect, guest, renderMail } from "@nuxvel/nuxt/testing";
import { mailpitMessagesTo, mailpitText } from "./helpers/mailpit";
import { setupPlayground } from "./helpers/playground";

describe("mail in a locale", async () => {
  await setupPlayground();

  it.for([
    [{ locale: "zh" }, {}, "欢迎，Ada", "感谢您的注册。"],
    [{}, { "accept-language": "zh-CN" }, "欢迎，Ada", "由 nuxvel playground 发送。"],
    [{}, {}, "Welcome, Ada", "Thanks for signing up."],
  ] as const)("sends with the option %o and the headers %o the subject %s", async ([query, headers, subject, body]) => {
    const to = `locale-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_send-mail-locale-check", { query: { to, ...query }, headers });

    const [delivered] = await mailpitMessagesTo(to);

    expect(delivered?.Subject).toBe(subject);
    expect(await mailpitText(delivered?.ID ?? "")).toContain(body);
  });

  it("renders the nuxvel auth mails in Chinese, with the keys that the app overrides", async () => {
    const verify = await renderMail("nuxvel.auth.verify-email", { to: "ada@example.com", url: "https://nuxvel.test/verify" }, { locale: "zh" });
    const existing = await renderMail("nuxvel.auth.existing-account", { to: "ada@example.com" }, { locale: "zh" });
    const notice = await renderMail(
      "nuxvel.auth.security-notice",
      { to: "ada@example.com", name: "Ada", change: "new-sign-in", device: "Firefox" },
      { locale: "zh" },
    );

    expect(verify.subject).toBe("请确认您的电子邮件地址");
    expect(verify.text).toContain("确认电子邮件地址 https://nuxvel.test/verify");
    expect(existing.subject).toBe("您已经有一个 playground 账户了");
    expect(existing.text).toContain("您已经有一个账户，因此没有任何更改。");
    expect(notice.text).toContain("Ada，您好：");
    expect(notice.text).toContain("设备：Firefox");
  });

  it("renders a locale that the app does not have in English", async () => {
    const { subject, text } = await renderMail("nuxvel.auth.reset-password", { to: "ada@example.com", name: "Ada", url: "https://nuxvel.test/reset" }, { locale: "fr" });

    expect(subject).toBe("Reset your password");
    expect(text).toContain("Hi Ada, open the link below to choose a new password.");
  });
});
