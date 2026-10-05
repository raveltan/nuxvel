import { healthChecksTable } from "../database/schema/health-check.schema";
import { probeQueued } from "../events/_probe/queued";

export default defineListener({
  event: probeQueued,
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
