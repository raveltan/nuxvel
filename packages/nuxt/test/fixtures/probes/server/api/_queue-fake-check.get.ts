import { z } from "zod";
import recordJob from "#server/jobs/_probe/record";
import { transaction } from "@nuxvel/nuxt/server/database";

const query = z.object({ name: z.string().min(1) });

export default defineEventHandler(async (event) => {
  const { name } = query.parse(getQuery(event));

  await transaction(async () => {
    await recordJob.dispatch({ name });
  });

  return { ok: true };
});
