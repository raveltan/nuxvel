export default defineJob({
  handler: () => {
    throw new ConflictError("probe.conflicts always conflicts");
  },
});
