import { healthChecksTable } from "#nuxvel/schema";
import { probeTransformed } from "#server/events/_probe/transformed";
import { useDb } from "@nuxvel/nuxt/server/database";
import { defineListener } from "@nuxvel/nuxt/server/events";

export default defineListener({
  event: probeTransformed,
  handler: async ({ names }) => {
    await useDb()
      .insert(healthChecksTable)
      .values(names.map((name) => ({ name: `queued:${name}` })));
  },
});
