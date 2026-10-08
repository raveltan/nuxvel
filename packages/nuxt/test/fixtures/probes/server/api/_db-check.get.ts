import { sql } from "drizzle-orm";
import { useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  await useDb().execute(sql`select 1`);
  return { ok: true };
});
