import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { useQueue } from "@nuxvel/nuxt/server/queues";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await $jobs._probe.record.dispatch({ name: "rolled-back" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  const afterRollback = await useDb().select().from(outboxTable);

  await transaction(async () => {
    await $jobs._probe.record.dispatch({ name: "crashed" });
  });

  const beforeRelay = await useQueue().getWaiting();
  const relayed = await relayOutbox();
  const relayedRows = await useDb()
    .select({ payload: outboxTable.payload, dispatchedAt: outboxTable.dispatchedAt })
    .from(outboxTable);
  const afterRelay = await useQueue().getWaiting();
  const relayedAgain = await relayOutbox();
  const afterSecondRelay = await useQueue().getWaiting();

  return {
    afterRollback: afterRollback.length,
    beforeRelay: beforeRelay.length,
    relayed,
    afterRelay: afterRelay.map((job) => ({
      name: job.name,
      data: job.data,
      removeOnComplete: job.opts.removeOnComplete,
      removeOnFail: job.opts.removeOnFail,
    })),
    relayedPayloads: relayedRows.map((row) => row.payload),
    relayedDispatched: relayedRows.every((row) => row.dispatchedAt !== null),
    relayedAgain,
    afterSecondRelay: afterSecondRelay.length,
  };
});
