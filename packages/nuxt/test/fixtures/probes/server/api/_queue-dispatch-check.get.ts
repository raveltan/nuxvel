import { isNull } from "drizzle-orm";
import { outboxTable } from "~~/server/database/schema/outbox.schema";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await $jobs._probe.record.dispatch({ name: "queued" });
  });

  const pending = await useDb().select().from(outboxTable).where(isNull(outboxTable.dispatchedAt));
  const beforeRelay = await useQueue().getWaiting();

  await relayOutbox();

  const waiting = await useQueue().getWaiting();
  const rows = await useDb().select().from(outboxTable);

  return {
    pending: pending.map((row) => ({ jobName: row.jobName, payload: row.payload })),
    beforeRelay: beforeRelay.map((job) => job.name),
    jobs: waiting.map((job) => ({ name: job.name, data: job.data })),
    undispatched: rows.filter((row) => row.dispatchedAt === null).length,
  };
});
