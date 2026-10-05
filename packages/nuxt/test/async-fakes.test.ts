import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { expect, expectMailSent, expectNoMailSent, expectNotQueued, expectQueued, guest, renderMail } from "@nuxvel/nuxt/testing";
import { $mails } from "#nuxvel/test-namespaces";
import { mailpitMessagesTo } from "./helpers/mailpit";
import { waitingJobNames } from "./helpers/queue";
import { setupPlayground } from "./helpers/playground";

describe("the queue and mail fakes", async () => {
  await setupPlayground();

  it("records a dispatched job instead of adding it to Redis", async () => {
    const name = `fake-${randomUUID()}`;

    await guest().$fetch("/api/_queue-fake-check", { query: { name } });

    await expectQueued("_probe.record", { name });
    await expectNotQueued("_probe.flaky");
    expect(await waitingJobNames()).toEqual([]);
  });

  it("expectNotQueued passes for another payload and fails for the queued one", async () => {
    const name = `fake-${randomUUID()}`;

    await guest().$fetch("/api/_queue-fake-check", { query: { name } });

    await expectNotQueued("_probe.record", { name: "another" });
    await expect(expectNotQueued("_probe.record", { name })).rejects.toThrow();
    await expect(expectNotQueued("_probe.record")).rejects.toThrow();
  });

  it("records a sent mail instead of delivering it to Mailpit", async () => {
    const to = `fake-mail-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-suppression-check", {
      query: { to, suppressed: "no" },
    });

    await expectMailSent("welcome", { to, name: "Ada" });
    await expectNoMailSent("password-reset");
    expect(await mailpitMessagesTo(to)).toEqual([]);
  });

  it("returns the input of the latest matching mail", async () => {
    const first = `fake-first-${randomUUID()}@nuxvel.test`;
    const second = `fake-second-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-suppression-check", { query: { to: first, suppressed: "no" } });
    await guest().$fetch("/api/_mail-suppression-check", { query: { to: second, suppressed: "no" } });

    expect(await expectMailSent("welcome", { to: first })).toMatchObject({ to: first, name: "Ada" });
    expect((await expectMailSent($mails.welcome)).to).toBe(second);
  });

  it("takes a mail's $mails stub in place of its name", async () => {
    const to = `fake-stub-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-suppression-check", {
      query: { to, suppressed: "no" },
    });

    await expectMailSent($mails.welcome, { to });
    await expect(expectNoMailSent($mails.welcome)).rejects.toThrow();
    expect((await renderMail($mails.welcome, { to, name: "Ada" })).subject).toBe("Welcome, Ada");
  });

  it("records nothing for a mail sent in a rolled-back transaction", async () => {
    const to = `fake-rollback-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-fake-rollback", { query: { to } });

    await expectNoMailSent("welcome");
  });

  it("records nothing for a suppressed address", async () => {
    const to = `fake-bounced-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-suppression-check", {
      query: { to, suppressed: "yes" },
    });

    await expectNoMailSent("welcome");
  });
});
