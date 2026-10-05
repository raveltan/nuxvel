import { healthChecksTable } from "~~/server/database/schema/health-check.schema";

async function nestedInsert() {
  await useDb().insert(healthChecksTable).values({});
}

export default defineEventHandler(async () => {
  const before = await useDb().select().from(healthChecksTable);

  try {
    await transaction(async () => {
      await nestedInsert();
      throw new Error("boom");
    });
  } catch {}

  const after = await useDb().select().from(healthChecksTable);

  return { before: before.length, after: after.length };
});
