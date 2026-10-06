export default defineJob({
  handler: async () => {
    await $jobs._probe.alwaysFails.dispatch({});
  },
});
