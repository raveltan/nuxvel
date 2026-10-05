import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";
import type { NotificationMessage } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    data: jsonb("data").$type<NotificationMessage>().notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [index("notifications_user_id_created_at_idx").on(table.userId, table.createdAt)],
);
