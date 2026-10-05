import { outboxTable } from "~~/server/database/schema/outbox.schema";

export default defineEventHandler(async () => {
  await useQueue().obliterate({ force: true });
  await useQueue("reports").obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await dispatchAfterCommit("_probe.record", { name: "default" });
    await dispatchAfterCommit("_probe.record-report", { name: "report" });
  });
  await relayOutbox();

  return {
    default: (await useQueue().getWaiting()).map((job) => job.name),
    reports: (await useQueue("reports").getWaiting()).map((job) => job.name),
    reportsBullName: useQueue("reports").name,
  };
});
