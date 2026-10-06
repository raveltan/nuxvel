import { z } from "zod";
import { startCountdownAction } from "#server/actions/jobs/start-countdown.action";

export const jobsRouter = {
  startCountdown: authedProcedure
    .input(countdownInput)
    .output(z.object({ dispatched: z.boolean() }))
    .mutation(({ input, ctx }) =>
      startCountdownAction(input, { actor: ctx.actor }),
    ),
};
