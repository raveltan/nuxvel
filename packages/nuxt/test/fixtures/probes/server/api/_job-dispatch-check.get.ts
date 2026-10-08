import recordJob from "#server/jobs/_probe/record";
import { transaction } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  try {
    await transaction(async () => {
      await recordJob.dispatch({ name: "rolled-back" });
      throw new Error("boom");
    });
  } catch {}

  await transaction(async () => {
    await recordJob.dispatch({ name: "committed" });
  });

  await recordJob.dispatch({ name: "immediate" });

  await transaction(async () => {
    try {
      await transaction(async () => {
        await recordJob.dispatch({ name: "nested-rolled-back" });
        throw new Error("inner boom");
      });
    } catch {}

    await recordJob.dispatch({ name: "nested-committed" });
  });

  return { ok: true };
});
