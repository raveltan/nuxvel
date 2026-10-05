import { outboxTable } from "~~/server/database/schema/outbox.schema";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await dispatchAfterCommit("_probe.record", { name: "later" }, { delay: 60_000 });
    await dispatchAfterCommit("_probe.record", { name: "urgent" }, { priority: 3 });
  });

  const rows = await useDb().select({ delay: outboxTable.delay, priority: outboxTable.priority }).from(outboxTable).orderBy(outboxTable.id);

  await relayOutbox();

  const refusal = await dispatchAfterCommit("_probe.record", { name: "never" }, { priority: 0 }).then(
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
