export default defineEventHandler(async () => {
  try {
    await transaction(async () => {
      await $jobs._probe.record.dispatch({ name: "rolled-back" });
      throw new Error("boom");
    });
  } catch {}

  await transaction(async () => {
    await $jobs._probe.record.dispatch({ name: "committed" });
  });

  await $jobs._probe.record.dispatch({ name: "immediate" });

  await transaction(async () => {
    try {
      await transaction(async () => {
        await $jobs._probe.record.dispatch({ name: "nested-rolled-back" });
        throw new Error("inner boom");
      });
    } catch {}

    await $jobs._probe.record.dispatch({ name: "nested-committed" });
  });

  return { ok: true };
});
