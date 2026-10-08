import { healthChecksTable } from "#nuxvel/schema";
import { audit } from "@nuxvel/nuxt/server/audit";
import { useDb } from "@nuxvel/nuxt/server/database";
import { defineSchedule } from "@nuxvel/nuxt/server/queues";

export default defineSchedule({
  every: { seconds: 2 },
  handler: async () => {
    const [row] = await useDb().insert(healthChecksTable).values({ name: "ticked" }).returning({ id: healthChecksTable.id });
    await audit("_probe.ticked", { type: "health_checks", id: row?.id });
  },
});
