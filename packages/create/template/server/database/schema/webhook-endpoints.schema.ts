import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";

export const webhookEndpointsTable = pgTable("webhook_endpoints", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
});
