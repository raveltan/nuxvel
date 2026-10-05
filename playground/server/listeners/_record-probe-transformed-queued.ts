import { healthChecksTable } from "../database/schema/health-check.schema";
import { probeTransformed } from "../events/_probe/transformed";

export default defineListener({
  event: probeTransformed,
  handler: async ({ names }) => {
    await useDb()
      .insert(healthChecksTable)
      .values(names.map((name) => ({ name: `queued:${name}` })));
  },
});
