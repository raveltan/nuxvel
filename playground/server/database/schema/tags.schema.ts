import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";

export const tagsTable = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  ...timestamps(),
});
