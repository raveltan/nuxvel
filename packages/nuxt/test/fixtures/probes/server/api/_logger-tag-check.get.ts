const tagged = probeNamed("_logger-tag-check.tagged", defineAction({
  handler: () => {
    useLogger().info("logger-tag-check in action");
  },
}));

const job = probeNamed("_logger-tag-check.job", defineJob({
  handler: () => {
    useLogger().info("logger-tag-check in job");
  },
}));

export default defineEventHandler(async () => {
  await tagged({}, { actor: systemActor("_logger-tag-check") });
  await job.run({ version: 1, payload: {} });
  useLogger().info("logger-tag-check outside");

  return { logged: true };
});
