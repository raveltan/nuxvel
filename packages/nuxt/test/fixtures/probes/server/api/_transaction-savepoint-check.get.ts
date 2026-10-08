import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { firstOrFail, transaction, useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  let outerId: number | undefined;

  await transaction(async () => {
    const row = await useDb()
      .insert(healthChecksTable)
      .values({})
      .returning()
      .then(firstOrFail);
    outerId = row.id;

    try {
      await transaction(async () => {
        await useDb().insert(healthChecksTable).values({});
        throw new Error("inner boom");
      });
    } catch {}
  });

  const rows = await useDb().select().from(healthChecksTable);

  return {
    count: rows.length,
    hasOuterRow: rows.some((row) => row.id === outerId),
  };
});
