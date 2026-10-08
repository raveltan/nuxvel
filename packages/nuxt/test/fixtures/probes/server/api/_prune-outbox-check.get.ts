import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { useDb } from "@nuxvel/nuxt/server/database";
import { now } from "@nuxvel/nuxt/server/observability";
import { pruneOutbox } from "@nuxvel/nuxt/server/queues";

const DAY_MS = 24 * 60 * 60 * 1000;

export default defineEventHandler(async () => {
  await useDb().delete(outboxTable);
  await useDb()
    .insert(outboxTable)
    .values([
      { jobName: "relayed 8 days ago", dispatchedAt: new Date(now().getTime() - 8 * DAY_MS) },
      { jobName: "relayed 2 days ago", dispatchedAt: new Date(now().getTime() - 2 * DAY_MS) },
      { jobName: "not relayed", dispatchedAt: null },
    ]);
  const remaining = async () =>
    (await useDb().select({ jobName: outboxTable.jobName }).from(outboxTable)).map((row) => row.jobName).sort();

  const byDefault = await pruneOutbox();
  const afterDefault = await remaining();
  const byOneDay = await pruneOutbox("1 day");

  return { byDefault, afterDefault, byOneDay, afterOneDay: await remaining() };
});
