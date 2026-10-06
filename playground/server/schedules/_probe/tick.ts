import { healthChecksTable } from "#nuxvel/schema";

export default defineSchedule({
  every: { seconds: 2 },
  handler: async () => {
    const [row] = await useDb().insert(healthChecksTable).values({ name: "ticked" }).returning({ id: healthChecksTable.id });
    await audit("_probe.ticked", { type: "health_checks", id: row?.id });
  },
});
