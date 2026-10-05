import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { deliverWebhook, expect, expectQueued } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("deliverWebhook()", async () => {
  await setupPlayground({
    env: {
      NUXT_PROBE_WEBHOOK_SECRET: "probe-webhook-test-secret",
      NUXT_STRIPE_WEBHOOK_SECRET: "whsec_stripe-test-secret",
      NUXT_GITHUB_WEBHOOK_SECRET: "github-test-secret",
      NUXT_RESEND_WEBHOOK_SECRET: `whsec_${Buffer.from("resend-test-signing-key").toString("base64")}`,
      NUXT_MAILGUN_WEBHOOK_SIGNING_KEY: "mailgun-test-signing-key",
    },
  });

  it("signs for an hmac() webhook", async () => {
    const id = randomUUID();

    const response = await deliverWebhook("_probe", { id, type: "probe.pinged" });

    expect(response.status).toBe(200);
    await expectQueued("_probe.webhook-received", { id });
  });

  it("signs for stripe", async () => {
    const id = randomUUID();

    const response = await deliverWebhook("_stripe", { id, type: "probe.pinged" });

    expect(response.status).toBe(200);
    await expectQueued("_probe.webhook-received", { id });
  });

  it("signs for github", async () => {
    const id = randomUUID();

    const response = await deliverWebhook("_github", { id, type: "probe.pinged" });

    expect(response.status).toBe(200);
    await expectQueued("_probe.webhook-received", { id });
  });

  it("signs for resend", async () => {
    const response = await deliverWebhook("mail.resend", { type: "email.delivered", data: { to: [`${randomUUID()}@nuxvel.test`] } });

    expect(response.status).toBe(200);
  });

  it("signs the same mailgun body twice with a new token each time", async () => {
    const body = { "event-data": { id: randomUUID(), event: "delivered", recipient: `${randomUUID()}@nuxvel.test` } };

    expect((await deliverWebhook("_mailgun", body)).status).toBe(200);
    expect((await deliverWebhook("_mailgun", body)).status).toBe(200);
  });

  it("rejects a name that no webhook has", async () => {
    // @ts-expect-error the name is typed
    await expect(deliverWebhook("missing", {})).rejects.toThrow('No webhook is named "missing"');
  });
});
