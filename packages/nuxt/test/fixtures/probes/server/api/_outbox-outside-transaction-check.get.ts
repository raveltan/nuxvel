import { outboxTable } from "~~/server/database/schema/outbox.schema";
import recordJob from "#server/jobs/_probe/record";
import { useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  await useDb().delete(outboxTable);

  await recordJob.dispatch({ name: "outside" });

  const rows = await useDb().select().from(outboxTable);

  return { jobNames: rows.map((row) => row.jobName) };
});
