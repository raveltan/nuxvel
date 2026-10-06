import { z } from "zod";

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
  create: authedProcedure.output(healthCheckSchema).action($actions.healthChecks.createHealthCheck),
  update: authedProcedure.output(healthCheckSchema).action($actions.healthChecks.updateHealthCheck),
};
