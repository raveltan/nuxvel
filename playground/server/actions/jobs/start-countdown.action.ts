
import { demoCountdownJob } from "#server/jobs/demo/countdown.job";
import { countdownInput } from "#shared/schemas/countdown";
import { defineAction } from "@nuxvel/nuxt/server/actions";

export const startCountdownAction = defineAction({
  input: countdownInput,
  handler: async (input) => {
    await demoCountdownJob.dispatch(input);

    return { dispatched: true };
  },
});
