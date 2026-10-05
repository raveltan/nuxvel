import { createHmac } from "node:crypto";
import { Redis } from "ioredis";
import { describe, it, vi } from "vitest";
import { expect, expectNotQueued, expectQueued, guest } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

const SECRET = "probe-webhook-test-secret";
const STRIPE_SECRET = "whsec_stripe-test-secret";
const GITHUB_SECRET = "github-test-secret";

function deliver(name: string, body: string, signature: string) {
  return guest().fetch(`/api/webhooks/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-probe-signature": signature,
    },
    body,
  });
}

function sign(body: string) {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

describe("defineWebhook()", async () => {
  await setupPlayground({
    env: {
      NUXT_PROBE_WEBHOOK_SECRET: SECRET,
      NUXT_STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
      NUXT_GITHUB_WEBHOOK_SECRET: GITHUB_SECRET,
    },
  });

  it("hands a delivery with a valid signature to the handler", async () => {
    const body = JSON.stringify({ id: "evt_valid", type: "probe.pinged" });

    const response = await deliver("_probe", body, sign(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    await expectQueued("_probe.webhook-received", {
      id: "evt_valid",
      type: "probe.pinged",
    });
  });

  it("still answers at the URL of the old name a renamed() alias keeps", async () => {
    const body = JSON.stringify({ id: "evt_old_url", type: "probe.pinged" });

    const response = await deliver("_probe-before-move", body, sign(body));

    expect(response.status).toBe(200);
    await expectQueued("_probe.webhook-received", { id: "evt_old_url" });
  });

  it("hands a verified delivery carrying HTML to the handler", async () => {
    const body = JSON.stringify({
      id: "evt_html",
      type: "probe.pinged",
      html: '<p onclick="x()">Hi</p><script>alert(1)</script>',
    });

    const response = await deliver("_probe", body, sign(body));

    expect(response.status).toBe(200);
    await expectQueued("_probe.webhook-received", { id: "evt_html" });
  });

  it("rejects an invalid signature before the handler runs", async () => {
    const body = JSON.stringify({ id: "evt_forged", type: "probe.pinged" });

    const response = await deliver("_probe", body, sign("something else"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      statusCode: 401,
      message: "Webhook signature is invalid",
      data: { code: "UNAUTHORIZED", message: "Webhook signature is invalid" },
    });
    await expectNotQueued("_probe.webhook-received");
  });

  it("answers 400 for a verified body that is not JSON", async () => {
    for (const body of ["{not json", ""]) {
      const response = await deliver("_probe", body, sign(body));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        statusCode: 400,
        message: "Invalid input",
        data: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          fields: { "": ["Webhook body is not valid JSON"] },
        },
      });
    }
    await expectNotQueued("_probe.webhook-received");
  });

  it("answers 400 for a payload its schema rejects, without recording its id", async () => {
    const invalid = JSON.stringify({ id: "evt_invalid_first" });

    const rejected = await deliver("_probe", invalid, sign(invalid));

    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({
      statusCode: 400,
      data: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fields: { type: [expect.any(String)] },
      },
    });
    await expectNotQueued("_probe.webhook-received");

    const valid = JSON.stringify({ id: "evt_invalid_first", type: "probe.pinged" });
    const accepted = await deliver("_probe", valid, sign(valid));

    expect(accepted.status).toBe(200);
    await expectQueued("_probe.webhook-received", { id: "evt_invalid_first" });
  });

  it("validates the payload with its schema's async refinements", async () => {
    const refused = JSON.stringify({ id: "evt_refused", type: "probe.refused" });
    const response = await deliver("_probe", refused, sign(refused));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      data: { fields: { type: ["This event type is refused"] } },
    });
  });

  it("answers 404 for a webhook nothing defines", async () => {
    const body = JSON.stringify({ id: "evt_missing" });

    const response = await deliver("missing", body, sign(body));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      statusCode: 404,
      message: 'No webhook is named "missing"',
      data: { code: "NOT_FOUND", message: 'No webhook is named "missing"' },
    });
  });

  it("runs the handler once for a delivery sent twice", async () => {
    const body = JSON.stringify({ id: "evt_repeated", type: "probe.pinged" });

    const first = await deliver("_probe", body, sign(body));
    const second = await deliver("_probe", body, sign(body));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true });
    await expectQueued("_probe.webhook-received", {}, { times: 1 });
  });

  it("answers 400 for an empty event ID, before the handler runs", async () => {
    const body = JSON.stringify({ id: "", type: "probe.pinged" });

    const response = await deliver("_probe", body, sign(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      statusCode: 400,
      data: { code: "VALIDATION_ERROR", fields: { "": ["Webhook event ID is empty"] } },
    });
    await expectNotQueued("_probe.webhook-received");
  });

  it("runs the handler again for a retry of a delivery whose handler threw", async () => {
    const body = JSON.stringify({ id: "evt_failing", type: "probe.failing" });

    const first = await deliver("_probe", body, sign(body));
    const retry = await deliver("_probe", body, sign(body));

    expect(first.status).toBe(500);
    expect(retry.status).toBe(500);
    await expectQueued("_probe.webhook-received", {}, { times: 2 });
  });

  it("answers a duplicate that arrives mid-handling 409 so the provider retries it", async () => {
    const body = JSON.stringify({ id: "evt_slow_failing", type: "probe.slow-failing" });

    const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");
    const first = deliver("_probe", body, sign(body));

    try {
      await vi.waitFor(async () => {
        expect(await redis.get("nuxvel:webhooks:_probe:evt_slow_failing")).toBe("processing");
      }, { timeout: 10_000, interval: 10 });
    } finally {
      redis.disconnect();
    }
    const concurrent = await deliver("_probe", body, sign(body));

    expect(concurrent.status).toBe(409);
    expect(await concurrent.json()).toMatchObject({
      statusCode: 409,
      message: "This delivery is already being handled",
      data: { code: "CONFLICT", message: "This delivery is already being handled" },
    });
    expect((await first).status).toBe(500);

    const retry = await deliver("_probe", body, sign(body));

    expect(retry.status).toBe(500);
    await expectQueued("_probe.webhook-received", {}, { times: 2 });
  });

  describe("built-in verifiers", () => {
    function post(name: string, body: string, headers: Record<string, string>) {
      return guest().fetch(`/api/webhooks/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      });
    }

    function stripeSignature(body: string, secret: string, signedAt = Math.floor(Date.now() / 1000)) {
      const digest = createHmac("sha256", secret).update(`${signedAt}.${body}`).digest("hex");

      return `t=${signedAt},v1=${digest}`;
    }

    it("accepts a correctly signed Stripe payload", async () => {
      const body = JSON.stringify({ id: "evt_stripe_valid", type: "invoice.paid" });

      const response = await post("_stripe", body, { "stripe-signature": stripeSignature(body, STRIPE_SECRET) });

      expect(response.status).toBe(200);
      await expectQueued("_probe.webhook-received", { id: "evt_stripe_valid" });
    });

    it("answers 401 for a Stripe payload signed with another secret or too long ago", async () => {
      const body = JSON.stringify({ id: "evt_stripe_forged", type: "invoice.paid" });
      const stale = Math.floor(Date.now() / 1000) - 600;

      const forged = await post("_stripe", body, { "stripe-signature": stripeSignature(body, "whsec_other") });
      const replayed = await post("_stripe", body, { "stripe-signature": stripeSignature(body, STRIPE_SECRET, stale) });

      expect(forged.status).toBe(401);
      expect(replayed.status).toBe(401);
      await expectNotQueued("_probe.webhook-received");
    });

    it("runs the handler once for a GitHub body replayed with a new x-github-delivery", async () => {
      const body = JSON.stringify({ id: "push-replayed", type: "push" });
      const signature = `sha256=${createHmac("sha256", GITHUB_SECRET).update(body).digest("hex")}`;

      const first = await post("_github", body, { "x-hub-signature-256": signature, "x-github-delivery": "gh-first" });
      const replay = await post("_github", body, { "x-hub-signature-256": signature, "x-github-delivery": "gh-replay" });

      expect(first.status).toBe(200);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual({ received: true });
      await expectQueued("_probe.webhook-received", {}, { times: 1 });
    });

    it("checks GitHub's x-hub-signature-256", async () => {
      const body = JSON.stringify({ id: "push", type: "push" });
      const digest = createHmac("sha256", GITHUB_SECRET).update(body).digest("hex");

      const signed = await post("_github", body, { "x-hub-signature-256": `sha256=${digest}`, "x-github-delivery": "gh-1" });
      const forged = await post("_github", body, { "x-hub-signature-256": `sha256=${sign(body)}`, "x-github-delivery": "gh-2" });

      expect(signed.status).toBe(200);
      expect(forged.status).toBe(401);
      await expectQueued("_probe.webhook-received", {}, { times: 1 });
    });
  });
});
