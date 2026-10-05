export default defineEventHandler(async () => {
  await transaction(async () => {
    await dispatchAfterCommit("_probe.tuned", { name: "a" });
  });

  return { ok: true };
});
