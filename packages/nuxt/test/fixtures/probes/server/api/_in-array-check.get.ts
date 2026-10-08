import { inArray } from "drizzle-orm";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async (event) => {
  const count = Number(getQuery(event).count);
  const names = Array.from({ length: count }, (_, index) => `in-array-${index}`);

  await useDb().select().from(healthChecksTable).where(inArray(healthChecksTable.name, names));

  return { ok: true };
});
