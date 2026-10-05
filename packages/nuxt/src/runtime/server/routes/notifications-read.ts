import { and, eq, isNull } from "drizzle-orm";
import { defineEventHandler, readValidatedBody } from "h3";
import { z } from "zod";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { announceChange } from "../notifications/announce-change";
import { unreadCount } from "../notifications/unread-count";
import { rateLimit } from "../security/point-of-use";
import { requireAuth } from "../utils/auth";
import { now } from "../clock/now";

const bodySchema = z.object({ id: z.uuid().optional() });

export default defineEventHandler({
  onRequest: [rateLimit({ points: 60, window: { minutes: 1 }, by: "user" })],
  handler: async (event): Promise<{ unreadCount: number }> => {
    const { id } = await readValidatedBody(event, bodySchema.parse);
    const { user } = await requireAuth();
    const notifications = schemaTable("notifications");
    const unread = and(eq(notifications.userId, user.id), isNull(notifications.readAt));

    await useDb()
      .update(notifications)
      .set({ readAt: now() })
      .where(id ? and(unread, eq(notifications.id, id)) : unread);
    await announceChange([user.id]);

    return { unreadCount: await unreadCount(user.id) };
  },
});
