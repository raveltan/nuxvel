import { z } from "zod";
import { createHealthCheckAction } from "#server/actions/health-checks/create-health-check.action";
import { updateHealthCheckAction } from "#server/actions/health-checks/update-health-check.action";
import { healthCheckSchema } from "#shared/schemas/health-check";
import { NotFoundError, authedProcedure, currentRequestId, publicProcedure } from "@nuxvel/nuxt/server/api";

export const healthRouter = {
  ping: publicProcedure.output(z.string()).query(() => "pong"),
  requestId: publicProcedure.output(z.string().optional()).query(() => currentRequestId()),
  explode: publicProcedure.output(z.never()).query(() => {
    throw new Error("procedure exploded");
  }),
  missing: publicProcedure.output(z.never()).query(() => {
    throw new NotFoundError("procedure found nothing");
  }),
  now: publicProcedure.output(z.object({ at: z.date() })).query(() => ({ at: new Date() })),
  echo: publicProcedure.input(z.string()).output(z.string()).mutation(({ input }) => input),
  create: authedProcedure.output(healthCheckSchema).action(createHealthCheckAction),
  update: authedProcedure.output(healthCheckSchema).action(updateHealthCheckAction),
};
