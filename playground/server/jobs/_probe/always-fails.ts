export default defineJob({
  channel: { authorize: () => true },
  handler: () => {
    throw new Error("probe.always-fails always fails");
  },
});
