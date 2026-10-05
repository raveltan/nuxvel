import { eq } from "drizzle-orm";
import { announceQueuedProbe } from "~~/server/actions/_probes/announce-queued-probe";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { outboxTable } from "~~/server/database/schema/outbox.schema";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await announceQueuedProbe(
    { name: "queued-listener" },
    { actor: systemActor("_queued-listener-check") },
  );

  const rows = await useDb()
    .select()
    .from(healthChecksTable)
    .where(eq(healthChecksTable.name, "queued-listener"));

  const beforeRelay = await useQueue().getWaiting();

  await relayOutbox();

  const waiting = await useQueue().getWaiting();

  return {
    rows: rows.map((row) => row.name),
    beforeRelay: beforeRelay.map((job) => job.name),
    jobs: waiting.map((job) => ({ name: job.name, data: job.data })),
  };
});
