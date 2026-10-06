import { healthChecksTable } from "#nuxvel/schema";

export const createHealthCheckAction = defineAction({
  input: createHealthCheckInput,
  handler: async (_input, ctx) => insertOne(healthChecksTable, { userId: ctx.actor.id }),
});
