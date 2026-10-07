import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { useQueue } from "@nuxvel/nuxt/server/queues";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await $jobs._probe.tuned.dispatch({ name: "a" });
    await $jobs._probe.tuned.dispatch({ name: "a" });
    await $jobs._probe.tuned.dispatch({ name: "b" });
    await $jobs._probe.record.dispatch({ name: "plain" });
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
