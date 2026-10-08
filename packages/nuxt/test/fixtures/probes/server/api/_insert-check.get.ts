import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async (event) => {
  const { name } = getQuery(event);

  await useDb().insert(healthChecksTable).values({ name: String(name) });

  return { ok: true };
});
