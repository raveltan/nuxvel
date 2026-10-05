import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { emit, expect, expectEmitted, expectFetched, expectListenerQueued, expectListenerRan, expectMailSent, expectNoListenerRan, expectNoMailSent, expectNoPushSent, expectNotEmitted, expectNotFetched, expectNotified, expectNotNotified, expectNotQueued, expectPushSent, expectQueued, fakeFetch, guest, runJob, sendNotification } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("the positive fake assertions", async () => {
  await setupPlayground();

  it("returns the payload, counts with times and lists what was recorded on failure", async () => {
    const name = `times-${randomUUID()}`;

    await guest().$fetch("/api/_queue-fake-check", { query: { name } });

    expect(await expectQueued("_probe.record", { name })).toEqual({ name });
    expect(await expectQueued("_probe.record", { name }, { times: 1 })).toEqual({ name });
    expect(await expectQueued("_probe.record", { name }, { times: 1 })).toEqual({ name });
    const failure = await expectQueued("_probe.record", { name }, { times: 2 }).catch((error: Error) => error.message);

    expect(failure).toMatch(/expected .* 2 times, found 1/);
    expect(await expectQueued("_probe.record", { name: "other" }, { times: 1 }).catch((error: Error) => error.message)).toMatch(/expected .* 1 time, found 0/);
    expect(failure).toContain(name);
  });

  it("lists the recorded mail when no mail matches", async () => {
    const to = `fake-assert-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-suppression-check", { query: { to, suppressed: "no" } });

    expect(await expectMailSent("welcome", { to }, { times: 1 })).toMatchObject({ to });
    const failure = await expectMailSent("welcome", { to: "other@nuxvel.test" }).catch((error: Error) => error.message);

    expect(failure).toContain(to);
  });

  it("checks no mail went out with the input of expectNoMailSent's match", async () => {
    const to = `no-mail-match-${randomUUID()}@nuxvel.test`;
    const other = `no-mail-other-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-suppression-check", { query: { to: other, suppressed: "no" } });

    await expectNoMailSent("welcome", { to });

    await guest().$fetch("/api/_mail-suppression-check", { query: { to, suppressed: "no" } });

    await expect(expectNoMailSent("welcome", { to })).rejects.toThrow(`expected no "welcome" mail with {"to":"${to}"}, found 1`);
  });

  it("returns the record from the event, listener, notification, push and fetch assertions", async () => {
    await emit("_probe.happened", { name: "assert-emitted", count: 1 });
    await emit("_probe.queued", { name: "assert-queued" });

    expect(await expectEmitted("_probe.happened", { name: "assert-emitted" }, { times: 1 })).toMatchObject({ name: "assert-emitted" });
    expect(await expectListenerRan("_record-probe-sync", { times: 1 })).toMatchObject({ name: "_record-probe-sync" });
    expect(await expectListenerQueued("_record-probe-queued", { times: 1 })).toMatchObject({ name: "assert-queued" });

    const ada = await userFactory({ name: "Ada" });

    await sendNotification(ada, "welcome", { name: "Ada" });

    expect(await expectNotified(ada, "welcome", {}, { times: 1 })).toMatchObject({ userId: ada.id, name: "welcome" });
    expect(await expectPushSent(ada, { title: "Welcome, Ada" }, { times: 1 })).toMatchObject({ title: "Welcome, Ada" });

    await fakeFetch({ "https://status.example.com/*": { body: { status: "green" } } });
    await runJob("_probe.post-to-url", { url: "https://status.example.com/ping", name: "faked" });

    expect(await expectFetched("https://status.example.com/ping", { method: "POST", times: 1 })).toMatchObject({
      method: "POST",
      url: "https://status.example.com/ping",
    });
  });

  it("rejects a times below 1", async () => {
    await expect(expectQueued("_probe.record", {}, { times: 0 })).rejects.toThrow("times must be 1 or more");
  });

  it("passes each negative before its trigger and fails after it", async () => {
    const name = `negative-${randomUUID()}`;
    const to = `negative-${randomUUID()}@nuxvel.test`;
    const ada = await userFactory({ name: "Ada" });

    await expectNotQueued("_probe.record", { name });
    await expectNotQueued("_probe.record", { name });
    await expectNoMailSent("welcome");
    await expectNotEmitted("_probe.happened", { name });
    await expectNoListenerRan("_record-probe-sync");
    await expectNotNotified(ada, "welcome");
    await expectNoPushSent(ada);
    await expectNotFetched("https://status.example.com/*");

    await guest().$fetch("/api/_queue-fake-check", { query: { name } });
    await guest().$fetch("/api/_mail-suppression-check", { query: { to, suppressed: "no" } });
    await emit("_probe.happened", { name, count: 1 });
    await sendNotification(ada, "welcome", { name: "Ada" });
    await fakeFetch({ "https://status.example.com/*": { body: { status: "green" } } });
    await runJob("_probe.post-to-url", { url: "https://status.example.com/ping", name: "faked" });

    await expect(expectNotQueued("_probe.record", { name })).rejects.toThrow(/expectNotQueued: expected no .* found 1/);
    await expect(expectNotQueued("_probe.record", { name })).rejects.toThrow(name);
    await expect(expectNoMailSent("welcome")).rejects.toThrow(/expected no "welcome" mail, found 1[\s\S]*Ada/);
    await expect(expectNotEmitted("_probe.happened", { name })).rejects.toThrow(name);
    await expect(expectNoListenerRan("_record-probe-sync")).rejects.toThrow("_record-probe-sync");
    await expect(expectNotNotified(ada, "welcome")).rejects.toThrow(ada.id);
    await expect(expectNoPushSent(ada)).rejects.toThrow(ada.id);
    await expect(expectNotFetched("https://status.example.com/*")).rejects.toThrow("status.example.com");
    await expectNotEmitted("_probe.happened", { name: "other" });
    await expectNotFetched("https://status.example.com/*", { method: "GET" });
  });
});
