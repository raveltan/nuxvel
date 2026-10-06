import { like } from "drizzle-orm";
import { findListener } from "../../../../../src/runtime/server/events/registry";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { probeTransformed } from "~~/server/events/_probe/transformed";

async function recorded() {
  const rows = await useDb()
    .select()
    .from(healthChecksTable)
    .where(like(healthChecksTable.name, "%:transformed-%"));

  return rows.map((row) => row.name).sort();
}

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(() => probeTransformed.emit({ names: "transformed-a,transformed-b" }));

  const afterEmit = await recorded();

  await relayOutbox();

  const job = (await useQueue().getWaiting()).find(
    (waiting) => waiting.name === "listener:_record-probe-transformed-queued",
  );
  const listener = findListener("_record-probe-transformed-queued");

  if (!job || !listener) throw new Error("the queued listener's job was not relayed");

  await listener.runQueued(job.data);

  return {
    afterEmit,
    queuedPayload: job.data,
    afterQueuedRun: await recorded(),
  };
});
