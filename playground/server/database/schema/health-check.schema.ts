import { index, pgTable, serial, text } from "drizzle-orm/pg-core";
import { belongsTo, timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const healthChecksTable = pgTable("health_checks", {
  id: serial("id").primaryKey(),
  userId: belongsTo(userTable, { nullable: true }),
  name: text("name").notNull().default(""),
  ...timestamps(),
}, (table) => [index("health_checks_user_id_idx").on(table.userId)]);
