import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { useQueue } from "@nuxvel/nuxt/server/queues";
import recordJob from "#server/jobs/_probe/record";
import { transaction, useDb } from "@nuxvel/nuxt/server/database";
import { relayOutbox } from "@nuxvel/nuxt/server/queues";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await recordJob.dispatch({ name: "later" }, { delay: { minutes: 1 } });
    await recordJob.dispatch({ name: "urgent" }, { priority: 3 });
  });

  const rows = await useDb().select({ delay: outboxTable.delay, priority: outboxTable.priority }).from(outboxTable).orderBy(outboxTable.id);

  await relayOutbox();

  const refusal = await recordJob.dispatch({ name: "never" }, { priority: 0 }).then(
    () => null,
    (error: Error) => error.name,
  );

  return {
    rows,
    delayed: (await useQueue().getDelayed()).map((job) => ({ name: job.name, delay: job.opts.delay })),
    prioritized: (await useQueue().getPrioritized()).map((job) => ({ name: job.name, priority: job.opts.priority })),
    refusal,
    written: (await useDb().select().from(outboxTable)).length,
  };
});
