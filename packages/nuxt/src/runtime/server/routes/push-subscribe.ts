import { defineEventHandler, readBody } from "h3";
import { z } from "zod";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { ValidationFailedError } from "../errors/taxonomy";
import { isPushServiceEndpoint } from "../push/push-service-endpoint";
import { rateLimit } from "../security/point-of-use";
import { requireAuth } from "../utils/auth";

const subscriptionSchema = z.object({
  endpoint: z.string().refine(isPushServiceEndpoint, { message: "Must be the endpoint of a browser push service" }),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export default defineEventHandler({
  onRequest: [rateLimit({ points: 10, window: { minutes: 1 }, by: "user" })],
  async handler(event) {
    const { user, session } = await requireAuth();
    const result = subscriptionSchema.safeParse(await readBody(event));

    if (!result.success) throw new ValidationFailedError(result.error);

    const { endpoint, keys } = result.data;
    const pushSubscriptions = schemaTable("push_subscriptions");

    await useDb()
      .insert(pushSubscriptions)
      .values({ userId: user.id, sessionId: session.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, sessionId: session.id, p256dh: keys.p256dh, auth: keys.auth },
      });

    return { subscribed: true };
  },
});
