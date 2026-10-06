import { healthChecksTable } from "#nuxvel/schema";

export const healthCheckPolicy = definePolicy(healthChecksTable, {
  update: (actor, row) => row.userId === actor.id,
  probe: allowSystem((actor, row) => row.name === "probe"),
});
