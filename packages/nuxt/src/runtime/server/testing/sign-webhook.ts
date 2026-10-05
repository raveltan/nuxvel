import { findWebhook } from "../webhooks/registry";
import type { SignedWebhook } from "../webhooks/signers";
import { webhookSigner } from "../webhooks/verifiers";

export function signWebhook(name: string, body: Record<string, unknown>): SignedWebhook {
  const webhook = findWebhook(name);

  if (!webhook) throw new Error(`No webhook is named "${name}"`);

  const sign = webhookSigner(webhook.verify);

  if (!sign) {
    throw new Error(
      `deliverWebhook: the webhook "${name}" checks signatures with its own function. Sign the request yourself and send it with fetch()`,
    );
  }

  return sign(body);
}
