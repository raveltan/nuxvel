import { z } from "zod";

export const jobsRouter = {
  startCountdown: authedProcedure.output(z.object({ dispatched: z.boolean() })).action($actions.jobs.startCountdown),
};
