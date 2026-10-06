import { setTimeout as sleep } from "node:timers/promises";

const STEP_MS = 250;

export const demoCountdownJob = defineJob({
  channel: { authorize: ({ user }) => user !== null },
  input: countdownInput,
  handler: async ({ fail }, { reportProgress }) => {
    for (const percent of [25, 50, 75]) {
      await sleep(STEP_MS);
      await reportProgress(percent);
    }

    if (fail) throw new Error("The countdown failed on purpose");

    await reportProgress(100);

    return { finishedAt: new Date().toISOString() };
  },
});
