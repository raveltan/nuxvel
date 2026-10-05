import { z } from "zod";
import { startCountdownAction } from "../../actions/jobs/start-countdown.action";
import { countdownInput } from "../../../shared/schemas/countdown";

export const jobsRouter = {
  startCountdown: authedProcedure
    .input(countdownInput)
    .output(z.object({ dispatched: z.boolean() }))
    .mutation(({ input, ctx }) =>
      startCountdownAction(input, { actor: ctx.actor }),
    ),
};
