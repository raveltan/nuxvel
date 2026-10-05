import { desc, eq } from "drizzle-orm";
import { defineEventHandler } from "h3";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import type { NotificationMessage } from "../notifications/notification-message";
import { unreadCount } from "../notifications/unread-count";
import { rateLimit } from "../security/point-of-use";
import { requireAuth } from "../utils/auth";

const RECENT = 20;

interface StoredNotification {
  id: string;
  name: string;
  data: NotificationMessage;
  readAt: Date | null;
  createdAt: Date;
}

export default defineEventHandler({
  onRequest: [rateLimit({ points: 60, window: { minutes: 1 }, by: "user" })],
  handler: async (): Promise<{ unreadCount: number; notifications: StoredNotification[] }> => {
    const { user } = await requireAuth();
    const notifications = schemaTable("notifications");
    const [recent, unread] = await Promise.all([
      useDb()
        .select({
          id: notifications.id,
          name: notifications.name,
          data: notifications.data,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(RECENT),
      unreadCount(user.id),
    ]);

    return { unreadCount: unread, notifications: recent };
  },
});
