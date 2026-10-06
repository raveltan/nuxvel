export default defineJob({
  handler: async () => {
    await dispatchAfterCommit("_probe.always-fails", {});
  },
});
