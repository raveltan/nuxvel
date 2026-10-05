import { z } from "zod";
import { createHealthCheckAction } from "../../actions/health-checks/create-health-check.action";
import { updateHealthCheckAction } from "../../actions/health-checks/update-health-check.action";
import { healthChecksTable } from "../../database/schema/health-check.schema";
import {
  createHealthCheckInput,
  healthCheckSchema,
  updateHealthCheckInput,
} from "../../../shared/schemas/health-check";

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
  create: authedProcedure
    .input(createHealthCheckInput)
    .output(healthCheckSchema)
    .mutation(({ input, ctx }) =>
      createHealthCheckAction(input, { actor: ctx.actor }),
    ),
  update: authedProcedure
    .input(updateHealthCheckInput)
    .output(healthCheckSchema)
    .use(audited("health-checks.update", { target: healthChecksTable }))
    .mutation(({ input, ctx }) =>
      updateHealthCheckAction(input, { actor: ctx.actor }),
    ),
};
