import { and, eq, gt, inArray } from "drizzle-orm";
import { useRuntimeConfig } from "nitropack/runtime";
import webpush from "web-push";
import { z } from "zod";
import { useDb } from "../../database/client";
import { type SchemaTable, schemaTable } from "../../database/schema-table";
import { effectReplacement } from "../../effects/replacements";
import { defineJob } from "../../jobs/define-job";
import { pushNotificationSchema } from "../push-notification";
import { isPushServiceEndpoint } from "../push-service-endpoint";

const GONE = new Set([404, 410]);

type Subscription = SchemaTable<"push_subscriptions">["$inferSelect"];

function vapidDetails() {
  const config = useRuntimeConfig();
  const details = {
    subject: config.pushVapidSubject,
    publicKey: config.public.pushVapidPublicKey,
    privateKey: config.pushVapidPrivateKey,
  };

  if (!details.subject || !details.publicKey || !details.privateKey) {
    throw new Error("NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY, NUXT_PUSH_VAPID_PRIVATE_KEY and NUXT_PUSH_VAPID_SUBJECT must be set");
  }

  return details;
}

async function deliver(subscription: Subscription, payload: string) {
  const fake = effectReplacement("deliverPush");

  if (fake) return fake(subscription.endpoint, payload);

  try {
    const sent = await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      { vapidDetails: vapidDetails() },
    );

    return sent.statusCode;
  } catch (error) {
    if (error instanceof webpush.WebPushError) return error.statusCode;
    throw error;
  }
}

export default defineJob({
  queue: "push",
  input: z.object({
    userIds: z.array(z.string()).min(1),
    notification: pushNotificationSchema.extend({ tag: z.string().optional() }),
  }),
  async handler({ userIds, notification }) {
    const pushSubscriptions = schemaTable("push_subscriptions");
    const sessions = schemaTable("session");
    const subscriptions = (
      await useDb()
        .select({ subscription: pushSubscriptions })
        .from(pushSubscriptions)
        .innerJoin(sessions, eq(sessions.id, pushSubscriptions.sessionId))
        .where(and(inArray(pushSubscriptions.userId, userIds), gt(sessions.expiresAt, new Date())))
    ).map((row) => row.subscription);
    const sendable = subscriptions.filter((subscription) => isPushServiceEndpoint(subscription.endpoint));
    const refused = subscriptions.filter((subscription) => !isPushServiceEndpoint(subscription.endpoint));
    const payload = JSON.stringify(notification);
    const statuses = await Promise.all(sendable.map((subscription) => deliver(subscription, payload)));
    const gone = sendable.filter((_, index) => GONE.has(statuses[index] ?? 0));
    const failed = statuses.filter((status) => status >= 400 && !GONE.has(status));
    const deleted = [...refused, ...gone];

    if (deleted.length > 0) {
      await useDb()
        .delete(pushSubscriptions)
        .where(inArray(pushSubscriptions.id, deleted.map((subscription) => subscription.id)));
    }

    if (failed.length > 0) {
      throw new Error(`${failed.length} of ${sendable.length} push deliveries failed with ${failed.join(", ")}`);
    }
  },
});
