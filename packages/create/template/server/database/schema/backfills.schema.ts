import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";

export const backfillsTable = pgTable("backfills", {
  name: text("name").primaryKey(),
  cursor: jsonb("cursor"),
  processed: integer("processed").notNull().default(0),
  total: integer("total").notNull(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$defaultFn(now),
});
