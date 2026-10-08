import { z } from "zod";
import { startCountdownAction } from "#server/actions/jobs/start-countdown.action";
import { authedProcedure } from "@nuxvel/nuxt/server/api";

export const jobsRouter = {
  startCountdown: authedProcedure.output(z.object({ dispatched: z.boolean() })).action(startCountdownAction),
};
