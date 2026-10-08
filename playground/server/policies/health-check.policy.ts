import { healthChecksTable } from "#nuxvel/schema";
import { allowGuest, allowSystem, definePolicy } from "@nuxvel/nuxt/server/authorization";

export const healthCheckPolicy = definePolicy(healthChecksTable, {
  update: (actor, row) => row.userId === actor.id,
  probe: allowSystem((actor, row) => row.name === "probe"),
  view: allowGuest((actor, row) => row.name === "probe"),
});
