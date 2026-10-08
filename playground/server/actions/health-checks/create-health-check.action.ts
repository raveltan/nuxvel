import { healthChecksTable } from "#nuxvel/schema";
import { createHealthCheckInput } from "#shared/schemas/health-check";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { insertOne } from "@nuxvel/nuxt/server/database";

export const createHealthCheckAction = defineAction({
  input: createHealthCheckInput,
  handler: async (_input, ctx) => insertOne(healthChecksTable, { userId: ctx.actor.id }),
});
