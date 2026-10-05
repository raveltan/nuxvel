import { countdownInput } from "../../../shared/schemas/countdown";

export const startCountdownAction = defineAction({
  input: countdownInput,
  handler: async (input) => {
    await dispatchAfterCommit("demo.countdown", input);

    return { dispatched: true };
  },
});
