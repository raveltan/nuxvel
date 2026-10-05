import { healthChecksTable } from "../database/schema/health-check.schema";
import { probeHappened } from "../events/_probe/happened";

export default defineListener({
  event: probeHappened,
  sync: true,
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
