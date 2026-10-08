import { setTimeout as sleep } from "node:timers/promises";
import { countdownInput } from "#shared/schemas/countdown";
import { defineJob } from "@nuxvel/nuxt/server/queues";

const STEP_MS = 250;

export const demoCountdownJob = defineJob({
  channel: {},
  input: countdownInput,
  handler: async ({ fail }, { reportProgress }) => {
    for (const percent of [25, 50, 75]) {
      await sleep(STEP_MS);
      await reportProgress(percent);
    }

    if (fail) throw new Error("The countdown failed on purpose");

    await reportProgress(100);

    return { finishedAt: new Date() };
  },
});
