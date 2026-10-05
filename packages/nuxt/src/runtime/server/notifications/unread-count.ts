import { and, eq, isNull } from "drizzle-orm";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";

export async function unreadCount(userId: string): Promise<number> {
  const notifications = schemaTable("notifications");

  return useDb().$count(notifications, and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
