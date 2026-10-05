import { outboxTable } from "~~/server/database/schema/outbox.schema";

export default defineEventHandler(async () => {
  await useDb().delete(outboxTable);

  await dispatchAfterCommit("_probe.record", { name: "outside" });

  const rows = await useDb().select().from(outboxTable);

  return { jobNames: rows.map((row) => row.jobName) };
});
