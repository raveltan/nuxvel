export default defineEventHandler(async () => {
  await transaction(async () => {
    await $jobs._probe.tuned.dispatch({ name: "a" });
  });

  return { ok: true };
});
