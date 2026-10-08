import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { useQueue } from "@nuxvel/nuxt/server/queues";
import recordJob from "#server/jobs/_probe/record";
import recordReportJob from "#server/jobs/_probe/record-report";
import { transaction, useDb } from "@nuxvel/nuxt/server/database";
import { relayOutbox } from "@nuxvel/nuxt/server/queues";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useQueue("reports").obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await recordJob.dispatch({ name: "default" });
    await recordReportJob.dispatch({ name: "report" });
  });
  await relayOutbox();

  return {
    default: (await useQueue().getWaiting()).map((job) => job.name),
    reports: (await useQueue("reports").getWaiting()).map((job) => job.name),
    reportsBullName: useQueue("reports").name,
  };
});
