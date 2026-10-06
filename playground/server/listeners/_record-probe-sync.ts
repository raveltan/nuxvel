import { healthChecksTable } from "#nuxvel/schema";
import { probeHappened } from "#server/events/_probe/happened";

export default defineListener({
  event: probeHappened,
  sync: true,
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
