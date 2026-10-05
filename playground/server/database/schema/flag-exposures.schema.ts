import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";

export const flagExposuresTable = pgTable(
  "flag_exposures",
  {
    name: text("name").notNull(),
    unitId: text("unit_id").notNull(),
    variant: text("variant").notNull(),
    exposedAt: timestamp("exposed_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [primaryKey({ columns: [table.name, table.unitId, table.variant] })],
);
