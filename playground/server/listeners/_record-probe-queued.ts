import { healthChecksTable } from "#nuxvel/schema";
import { probeQueued } from "#server/events/_probe/queued";
import { useDb } from "@nuxvel/nuxt/server/database";
import { defineListener } from "@nuxvel/nuxt/server/events";

export default defineListener({
  event: probeQueued,
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
