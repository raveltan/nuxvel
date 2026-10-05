import { createHmac, randomUUID } from "node:crypto";
import { now } from "../clock/now";
import { useSecrets } from "../security/secrets";

export interface SignedWebhook {
  rawBody: string;
  headers: Record<string, string>;
}

export type WebhookSigner = (body: Record<string, unknown>) => SignedWebhook;

function digest(secret: string | Buffer, content: string, encoding: "hex" | "base64") {
  return createHmac("sha256", secret).update(content).digest(encoding);
}

function seconds() {
  return Math.floor(now().getTime() / 1000);
}

function json(body: Record<string, unknown>, headers: Record<string, string>): SignedWebhook {
  return { rawBody: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } };
}

export const signStripe: WebhookSigner = (body) => {
  const [secret = ""] = useSecrets("NUXT_STRIPE_WEBHOOK_SECRET");
  const timestamp = seconds();
  const signed = json(body, {});

  signed.headers["stripe-signature"] = `t=${timestamp},v1=${digest(secret, `${timestamp}.${signed.rawBody}`, "hex")}`;

  return signed;
};

export const signGithub: WebhookSigner = (body) => {
  const [secret = ""] = useSecrets("NUXT_GITHUB_WEBHOOK_SECRET");
  const signed = json(body, {});

  signed.headers["x-hub-signature-256"] = `sha256=${digest(secret, signed.rawBody, "hex")}`;

  return signed;
};

export const signResend: WebhookSigner = (body) => {
  const [secret = ""] = useSecrets("NUXT_RESEND_WEBHOOK_SECRET");
  const id = `msg_${randomUUID()}`;
  const timestamp = String(seconds());
  const signed = json(body, { "svix-id": id, "svix-timestamp": timestamp });
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");

  signed.headers["svix-signature"] = `v1,${digest(key, `${id}.${timestamp}.${signed.rawBody}`, "base64")}`;

  return signed;
};

export const signMailgun: WebhookSigner = (body) => {
  const [key = ""] = useSecrets("NUXT_MAILGUN_WEBHOOK_SIGNING_KEY");
  const timestamp = String(seconds());
  const token = randomUUID();

  return json({ ...body, signature: { timestamp, token, signature: digest(key, timestamp + token, "hex") } }, {});
};

export function signHmac(options: { header: string; secret: string }): WebhookSigner {
  return (body) => {
    const [secret = ""] = useSecrets(options.secret);
    const signed = json(body, {});

    signed.headers[options.header] = digest(secret, signed.rawBody, "hex");

    return signed;
  };
}
