import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { useQueue } from "@nuxvel/nuxt/server/queues";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useQueue("reports").obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await $jobs._probe.record.dispatch({ name: "default" });
    await $jobs._probe.recordReport.dispatch({ name: "report" });
  });
  await relayOutbox();

  return {
    default: (await useQueue().getWaiting()).map((job) => job.name),
    reports: (await useQueue("reports").getWaiting()).map((job) => job.name),
    reportsBullName: useQueue("reports").name,
  };
});
