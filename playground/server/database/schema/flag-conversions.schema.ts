import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";

export const flagConversionsTable = pgTable(
  "flag_conversions",
  {
    name: text("name").notNull(),
    unitId: text("unit_id").notNull(),
    metric: text("metric").notNull(),
    convertedAt: timestamp("converted_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [primaryKey({ columns: [table.name, table.unitId, table.metric] })],
);
