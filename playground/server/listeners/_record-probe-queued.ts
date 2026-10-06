import { healthChecksTable } from "#nuxvel/schema";
import { probeQueued } from "#server/events/_probe/queued";

export default defineListener({
  event: probeQueued,
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
