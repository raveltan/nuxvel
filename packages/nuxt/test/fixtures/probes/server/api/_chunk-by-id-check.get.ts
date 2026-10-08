import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { chunkById, useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  const name = randomUUID();
  const inserted = await useDb()
    .insert(healthChecksTable)
    .values(Array.from({ length: 7 }, () => ({ name })))
    .returning();
  const chunks: number[][] = [];

  await chunkById(healthChecksTable, 3, async (rows) => {
    chunks.push(rows.map((row) => row.id));
  }, { where: eq(healthChecksTable.name, name) });

  return { inserted: inserted.map((row) => row.id).toSorted((a, b) => a - b), chunks };
});
