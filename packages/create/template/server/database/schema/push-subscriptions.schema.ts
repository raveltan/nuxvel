import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";
import { sessionTable, userTable } from "./auth.schema";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => sessionTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
}, (table) => [
  index("push_subscriptions_user_id_idx").on(table.userId),
  index("push_subscriptions_session_id_idx").on(table.sessionId),
]);
