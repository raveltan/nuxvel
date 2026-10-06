import { z } from "zod";
import { type Webhook, defineWebhook } from "../webhooks/define-webhook";
import { type MailSuppressionReason, suppressMail } from "./suppress-mail";

/** A mail provider whose bounce and complaint events {@link defineMailWebhook} understands. */
export type MailWebhookProvider = "resend" | "mailgun";

const resendEvent = z.object({
  type: z.string(),
  data: z.object({
    to: z.array(z.string()).optional(),
    bounce: z.object({ type: z.string() }).optional(),
  }),
});

const mailgunEvent = z.object({
  "event-data": z.object({
    id: z.string(),
    event: z.string(),
    severity: z.string().optional(),
    recipient: z.string(),
  }),
});

function resendReason({ type, data }: z.output<typeof resendEvent>): MailSuppressionReason | undefined {
  if (type === "email.complained") return "complaint";
  if (type === "email.bounced" && data.bounce?.type !== "Transient") return "bounce";

  return undefined;
}

function mailgunReason({ event, severity }: z.output<typeof mailgunEvent>["event-data"]): MailSuppressionReason | undefined {
  if (event === "complained") return "complaint";
  if (event === "failed" && severity === "permanent") return "bounce";

  return undefined;
}

/**
 * Defines the webhook your mail provider posts bounce and complaint
 * events to. Each bounced or complaining address goes on the suppression
 * list with {@link suppressMail}, so {@link Mail.send} skips it.
 *
 * Auto-imported on the server. Put it in a file under `server/webhooks/`,
 * like any {@link defineWebhook}, and give the provider its URL. It
 * checks the provider's signature with the secret in
 * `NUXT_RESEND_WEBHOOK_SECRET` or `NUXT_MAILGUN_WEBHOOK_SIGNING_KEY`, and
 * acknowledges every other event without an effect. A temporary bounce
 * does not suppress the address.
 *
 * @example
 * ```ts
 * // server/webhooks/mail/resend.webhook.ts
 * export const mailResendWebhook = defineMailWebhook("resend");
 * ```
 */
export function defineMailWebhook(provider: MailWebhookProvider): Webhook {
  if (provider === "mailgun") {
    return defineWebhook({
      payload: mailgunEvent,
      verify: "mailgun",
      eventId: ({ payload }) => payload["event-data"].id,
      handler: async ({ payload }) => {
        const reason = mailgunReason(payload["event-data"]);

        if (reason) await suppressMail(payload["event-data"].recipient, reason);
      },
    });
  }

  return defineWebhook({
    payload: resendEvent,
    verify: "resend",
    handler: async ({ payload }) => {
      const reason = resendReason(payload);

      if (!reason) return;

      for (const address of payload.data.to ?? []) await suppressMail(address, reason);
    },
  });
}
