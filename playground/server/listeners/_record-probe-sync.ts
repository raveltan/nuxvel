import { healthChecksTable } from "#nuxvel/schema";
import { probeHappened } from "#server/events/_probe/happened";
import { useDb } from "@nuxvel/nuxt/server/database";
import { defineListener } from "@nuxvel/nuxt/server/events";

export default defineListener({
  event: probeHappened,
  sync: true,
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
