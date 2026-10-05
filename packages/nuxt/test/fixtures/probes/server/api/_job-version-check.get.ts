import { inArray } from "drizzle-orm";
import { findJob } from "../../../../../src/runtime/server/jobs/registry";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { outboxTable } from "~~/server/database/schema/outbox.schema";

const NAMES = ["upcast-me", "already-current"];

export default defineEventHandler(async () => {
  await useDb().delete(healthChecksTable).where(inArray(healthChecksTable.name, NAMES));
  await useDb().delete(outboxTable);

  const job = findJob("_probe.record-renamed");

  if (!job) throw new Error("probe.record-renamed is not defined");

  await job.run({ version: 1, payload: { label: "upcast-me" } });
  await job.run({ version: 2, payload: { name: "already-current" } });

  const rows = await useDb()
    .select()
    .from(healthChecksTable)
    .where(inArray(healthChecksTable.name, NAMES));

  await transaction(async () => {
    await dispatchAfterCommit("_probe.record-renamed", { name: "dispatched" });
  });

  const queued = await useDb().select().from(outboxTable);

  return {
    rows: rows.map((row) => row.name).sort(),
    version: job.version,
    queued: queued.map((row) => ({ jobName: row.jobName, payload: row.payload })),
  };
});
