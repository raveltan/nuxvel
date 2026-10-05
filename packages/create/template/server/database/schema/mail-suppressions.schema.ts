import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";
import type { MailSuppressionReason } from "@nuxvel/nuxt/database";

export const mailSuppressionsTable = pgTable("mail_suppressions", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(),
  reason: text("reason").$type<MailSuppressionReason>().notNull(),
  suppressedAt: timestamp("suppressed_at").notNull().defaultNow().$defaultFn(now),
});
