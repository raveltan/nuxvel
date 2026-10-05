import { healthChecksTable } from "~~/server/database/schema/health-check.schema";

export default defineEventHandler(async (event) => {
  const { name } = getQuery(event);

  await useDb().insert(healthChecksTable).values({ name: String(name) });

  return { ok: true };
});
