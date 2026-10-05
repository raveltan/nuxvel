import { createHmac } from "node:crypto";
import { z } from "zod";
import { now } from "../clock/now";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";
import { sameText } from "../security/same-text";
import { useSecrets } from "../security/secrets";
import type { WebhookRequest } from "./define-webhook";
import { signGithub, signHmac, signMailgun, signResend, signStripe, type WebhookSigner } from "./signers";

const TOLERANCE_SECONDS = 300;

/** Checks a webhook delivery's signature: what `defineWebhook({ verify })` takes. */
export type WebhookVerifier = (request: WebhookRequest) => boolean | Promise<boolean>;

/**
 * A provider whose signature scheme nuxvel checks for you, and the env var
 * that holds its signing secret:
 *
 * | Name | Header | Secret |
 * |---|---|---|
 * | `"stripe"` | `stripe-signature` | `NUXT_STRIPE_WEBHOOK_SECRET` |
 * | `"github"` | `x-hub-signature-256` | `NUXT_GITHUB_WEBHOOK_SECRET` |
 * | `"resend"` | `svix-signature` | `NUXT_RESEND_WEBHOOK_SECRET` |
 * | `"mailgun"` | `signature` in the body | `NUXT_MAILGUN_WEBHOOK_SIGNING_KEY` |
 *
 * `"mailgun"` refuses a token that it saw before, because Mailgun signs only
 * the timestamp and the token, not the event.
 */
export type WebhookProvider = "stripe" | "github" | "resend" | "mailgun";

function digest(secret: string | Buffer, content: string, encoding: "hex" | "base64") {
  return createHmac("sha256", secret).update(content).digest(encoding);
}

function isRecent(seconds: string | undefined) {
  const at = Number(seconds);

  return Number.isFinite(at) && Math.abs(now().getTime() / 1000 - at) <= TOLERANCE_SECONDS;
}

function stripe({ rawBody, headers }: WebhookRequest) {
  const parts = (headers.get("stripe-signature") ?? "").split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");

  if (!isRecent(timestamp)) return false;

  return useSecrets("NUXT_STRIPE_WEBHOOK_SECRET").some((secret) =>
    signatures.some((signature) => sameText(digest(secret, `${timestamp}.${rawBody}`, "hex"), signature)),
  );
}

function github({ rawBody, headers }: WebhookRequest) {
  const signature = headers.get("x-hub-signature-256") ?? "";

  return useSecrets("NUXT_GITHUB_WEBHOOK_SECRET").some((secret) =>
    sameText(`sha256=${digest(secret, rawBody, "hex")}`, signature),
  );
}

function resend({ rawBody, headers }: WebhookRequest) {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp") ?? undefined;
  const signatures = (headers.get("svix-signature") ?? "").split(" ").map((entry) => entry.replace(/^v1,/, ""));

  if (!id || !isRecent(timestamp)) return false;

  return useSecrets("NUXT_RESEND_WEBHOOK_SECRET").some((secret) => {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = digest(key, `${id}.${timestamp}.${rawBody}`, "base64");

    return signatures.some((signature) => sameText(expected, signature));
  });
}

const mailgunBody = z.object({
  signature: z.object({ timestamp: z.string(), token: z.string(), signature: z.string() }),
});

function mailgunSignature(rawBody: string) {
  try {
    return mailgunBody.safeParse(JSON.parse(rawBody)).data?.signature;
  } catch {
    return undefined;
  }
}

async function mailgun({ rawBody }: WebhookRequest) {
  const signed = mailgunSignature(rawBody);

  if (!signed || !isRecent(signed.timestamp)) return false;

  const valid = useSecrets("NUXT_MAILGUN_WEBHOOK_SIGNING_KEY").some((key) =>
    sameText(digest(key, signed.timestamp + signed.token, "hex"), signed.signature),
  );

  if (!valid) return false;

  const fresh = await useRedis("durable").set(
    redisKey(`nuxvel:webhooks:mailgun-token:${signed.token}`),
    "used",
    "EX",
    TOLERANCE_SECONDS * 3,
    "NX",
  );

  return fresh === "OK";
}

const providers: Record<WebhookProvider, WebhookVerifier> = { stripe, github, resend, mailgun };

const signers = new WeakMap<WebhookVerifier, WebhookSigner>([
  [stripe, signStripe],
  [github, signGithub],
  [resend, signResend],
  [mailgun, signMailgun],
]);

export function webhookSigner(verify: WebhookVerifier) {
  return signers.get(verify);
}

export function providerVerifier(verify: WebhookProvider | WebhookVerifier): WebhookVerifier {
  return typeof verify === "function" ? verify : providers[verify];
}

/**
 * A webhook verifier for the common scheme: the header holds the
 * hex-encoded HMAC-SHA256 of the raw body.
 *
 * It signs only the body and checks no timestamp: leave out `eventId` or
 * read it from the payload, and a copy of a delivery runs again after
 * nuxvel forgets its key, 7 days later.
 *
 * Auto-imported on the server. Pass it as `verify` to {@link defineWebhook}
 * when a provider signs this way and is not one of the built-in
 * {@link WebhookProvider} names. The secret is read with
 * {@link useSecrets}, so it can be rotated.
 *
 * @param options.header The request header that carries the signature.
 * @param options.secret The env var that holds the signing secret.
 *
 * @example
 * ```ts
 * export const newsletterWebhook = defineWebhook({
 *   verify: hmac({ header: "x-signature", secret: "NUXT_NEWSLETTER_WEBHOOK_SECRET" }),
 *   handler: () => {},
 * });
 * ```
 */
export function hmac(options: { header: string; secret: string }): WebhookVerifier {
  const verifier: WebhookVerifier = ({ rawBody, headers }) => {
    const signature = headers.get(options.header) ?? "";

    return useSecrets(options.secret).some((secret) => sameText(digest(secret, rawBody, "hex"), signature));
  };

  signers.set(verifier, signHmac(options));

  return verifier;
}
