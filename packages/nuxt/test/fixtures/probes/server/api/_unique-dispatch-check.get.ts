import tunedJob from "#server/jobs/_probe/tuned";
import { transaction } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  await transaction(async () => {
    await tunedJob.dispatch({ name: "a" });
  });

  return { ok: true };
});
