import { healthChecksTable } from "#nuxvel/schema";
import { probeTransformed } from "#server/events/_probe/transformed";

export default defineListener({
  event: probeTransformed,
  sync: true,
  handler: async ({ names }) => {
    await useDb()
      .insert(healthChecksTable)
      .values(names.map((name) => ({ name: `sync:${name}` })));
  },
});
