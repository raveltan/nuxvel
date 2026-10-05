import { createHmac, randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { expect, expectNoRow, expectRow, guest } from "@nuxvel/nuxt/testing";
import { mailSuppressionsTable } from "../../../playground/server/database/schema/mail-suppressions.schema";
import { setupPlayground } from "./helpers/playground";

const RESEND_KEY = Buffer.from("resend-test-signing-key");
const MAILGUN_KEY = "mailgun-test-signing-key";

function unixNow() {
  return String(Math.floor(Date.now() / 1000));
}

function postResend(event: object, key = RESEND_KEY) {
  const body = JSON.stringify(event);
  const id = `msg_${randomUUID()}`;
  const timestamp = unixNow();
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");

  return guest().fetch("/api/webhooks/mail.resend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body,
  });
}

function signMailgun(key = MAILGUN_KEY) {
  const timestamp = unixNow();
  const token = randomUUID();

  return { timestamp, token, signature: createHmac("sha256", key).update(timestamp + token).digest("hex") };
}

function postMailgun(eventData: object, signature = signMailgun()) {
  return guest().fetch("/api/webhooks/_mailgun", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signature, "event-data": { id: randomUUID(), ...eventData } }),
  });
}

describe("defineMailWebhook()", async () => {
  await setupPlayground({
    env: {
      NUXT_RESEND_WEBHOOK_SECRET: `whsec_${RESEND_KEY.toString("base64")}`,
      NUXT_MAILGUN_WEBHOOK_SIGNING_KEY: MAILGUN_KEY,
    },
  });

  it("suppresses the address of a signed Resend bounce and complaint", async () => {
    const bounced = `bounced-${randomUUID()}@nuxvel.test`;
    const complained = `complained-${randomUUID()}@nuxvel.test`;

    const bounce = await postResend({ type: "email.bounced", data: { to: [bounced], bounce: { type: "Permanent" } } });
    const complaint = await postResend({ type: "email.complained", data: { to: [complained] } });

    expect(bounce.status).toBe(200);
    expect(complaint.status).toBe(200);
    await expectRow(mailSuppressionsTable, { address: bounced, reason: "bounce" });
    await expectRow(mailSuppressionsTable, { address: complained, reason: "complaint" });
  });

  it("acknowledges other Resend events and temporary bounces without suppressing", async () => {
    const address = `delivered-${randomUUID()}@nuxvel.test`;

    const delivered = await postResend({ type: "email.delivered", data: { to: [address] } });
    const transient = await postResend({ type: "email.bounced", data: { to: [address], bounce: { type: "Transient" } } });

    expect(delivered.status).toBe(200);
    expect(transient.status).toBe(200);
    await expectNoRow(mailSuppressionsTable, { address });
  });

  it("answers 401 for a Resend bounce signed with another key", async () => {
    const address = `forged-${randomUUID()}@nuxvel.test`;

    const response = await postResend({ type: "email.bounced", data: { to: [address] } }, Buffer.from("other"));

    expect(response.status).toBe(401);
    await expectNoRow(mailSuppressionsTable, { address });
  });

  it("suppresses a signed Mailgun permanent failure and complaint, not a temporary one", async () => {
    const failed = `failed-${randomUUID()}@nuxvel.test`;
    const complained = `complained-${randomUUID()}@nuxvel.test`;
    const deferred = `deferred-${randomUUID()}@nuxvel.test`;

    const responses = await Promise.all([
      postMailgun({ event: "failed", severity: "permanent", recipient: failed }),
      postMailgun({ event: "complained", recipient: complained }),
      postMailgun({ event: "failed", severity: "temporary", recipient: deferred }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    await expectRow(mailSuppressionsTable, { address: failed, reason: "bounce" });
    await expectRow(mailSuppressionsTable, { address: complained, reason: "complaint" });
    await expectNoRow(mailSuppressionsTable, { address: deferred });
  });

  it("answers 401 for a Mailgun event signed with another key", async () => {
    const address = `forged-${randomUUID()}@nuxvel.test`;

    const response = await postMailgun({ event: "failed", severity: "permanent", recipient: address }, signMailgun("other"));

    expect(response.status).toBe(401);
    await expectNoRow(mailSuppressionsTable, { address });
  });

  it("answers 401 when a Mailgun signature is used again with other event data", async () => {
    const seen = `seen-${randomUUID()}@nuxvel.test`;
    const victim = `victim-${randomUUID()}@nuxvel.test`;
    const signature = signMailgun();

    const first = await postMailgun({ event: "delivered", recipient: seen }, signature);
    const replay = await postMailgun({ event: "complained", recipient: victim }, signature);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    await expectNoRow(mailSuppressionsTable, { address: victim });
  });

  it("acknowledges a Mailgun retry with a new signature and the same event ID without running the handler again", async () => {
    const address = `retry-${randomUUID()}@nuxvel.test`;
    const id = randomUUID();

    const first = await postMailgun({ id, event: "delivered", recipient: address });
    const retry = await postMailgun({ id, event: "complained", recipient: address }, signMailgun());

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ received: true });
    await expectNoRow(mailSuppressionsTable, { address });
  });
});
