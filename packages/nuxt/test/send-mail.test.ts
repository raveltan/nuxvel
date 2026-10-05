import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { expect, guest, useRealQueue } from "@nuxvel/nuxt/testing";
import { mailpitHtmlSupport, mailpitMessagesTo } from "./helpers/mailpit";
import { setupPlayground } from "./helpers/playground";

describe("sendMail()", async () => {
  await setupPlayground();

  useRealQueue();

  it("sends nothing for a rolled-back transaction and delivers a committed one to Mailpit", async () => {
    const run = randomUUID();
    const rolledBack = `rolled-back-${run}@nuxvel.test`;
    const committed = `committed-${run}@nuxvel.test`;

    await guest().$fetch("/api/_send-mail-check", { query: { rolledBack, committed } });

    expect(await mailpitMessagesTo(rolledBack)).toEqual([]);

    const delivered = await mailpitMessagesTo(committed);

    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.Subject).toBe("Welcome, Ada");
  });

  it("sendMailNow() takes the mail's definition and delivers at once, with no job, even when the transaction rolls back", async () => {
    const to = `now-${randomUUID()}@nuxvel.test`;

    expect(await guest().$fetch("/api/_send-mail-now-check", { query: { to } })).toEqual({ outboxRows: 0 });

    const delivered = await mailpitMessagesTo(to);

    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.Subject).toBe("Welcome, Grace");
  });

  it("delivers the security notice as HTML that Mailpit's check scores at least 84 % supported", async () => {
    const to = `notice-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_send-security-notice", { query: { to } });

    const [delivered] = await mailpitMessagesTo(to);

    expect(delivered?.Subject).toBe("Security notice for your account");
    expect(await mailpitHtmlSupport(delivered?.ID ?? "")).toBeGreaterThanOrEqual(84);
  });
});
