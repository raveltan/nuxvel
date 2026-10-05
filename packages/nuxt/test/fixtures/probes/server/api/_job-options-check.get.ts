import { outboxTable } from "~~/server/database/schema/outbox.schema";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await dispatchAfterCommit("_probe.tuned", { name: "a" });
    await dispatchAfterCommit("_probe.tuned", { name: "a" });
    await dispatchAfterCommit("_probe.tuned", { name: "b" });
    await dispatchAfterCommit("_probe.record", { name: "plain" });
  });
  await relayOutbox();

  const waiting = await useQueue().getWaiting();

  return waiting
    .map((job) => ({
      name: job.name,
      id: Number(job.id),
      data: job.data,
      attempts: job.opts.attempts,
      backoff: job.opts.backoff,
      deduplication: job.opts.deduplication?.id ?? null,
    }))
    .sort((left, right) => left.id - right.id);
});
