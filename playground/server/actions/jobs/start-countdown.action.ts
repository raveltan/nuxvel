
export const startCountdownAction = defineAction({
  input: countdownInput,
  handler: async (input) => {
    await $jobs.demo.countdown.dispatch(input);

    return { dispatched: true };
  },
});
