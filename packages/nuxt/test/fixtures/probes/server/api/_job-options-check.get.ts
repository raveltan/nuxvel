import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { useQueue } from "@nuxvel/nuxt/server/queues";
import recordJob from "#server/jobs/_probe/record";
import tunedJob from "#server/jobs/_probe/tuned";
import { transaction, useDb } from "@nuxvel/nuxt/server/database";
import { relayOutbox } from "@nuxvel/nuxt/server/queues";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await tunedJob.dispatch({ name: "a" });
    await tunedJob.dispatch({ name: "a" });
    await tunedJob.dispatch({ name: "b" });
    await recordJob.dispatch({ name: "plain" });
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
