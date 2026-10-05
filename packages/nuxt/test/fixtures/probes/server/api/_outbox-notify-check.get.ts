import { z } from "zod";

const query = z.object({ name: z.string().min(1) });

export default defineEventHandler(async (event) => {
  const { name } = query.parse(getQuery(event));

  await transaction(async () => {
    await dispatchAfterCommit("_probe.record", { name });
  });

  return { committedAt: Date.now() };
});
