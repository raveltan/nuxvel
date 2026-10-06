import { outboxTable } from "~~/server/database/schema/outbox.schema";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await $jobs._probe.record.dispatch({ name: "later" }, { delay: 60_000 });
    await $jobs._probe.record.dispatch({ name: "urgent" }, { priority: 3 });
  });

  const rows = await useDb().select({ delay: outboxTable.delay, priority: outboxTable.priority }).from(outboxTable).orderBy(outboxTable.id);

  await relayOutbox();

  const refusal = await $jobs._probe.record.dispatch({ name: "never" }, { priority: 0 }).then(
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
