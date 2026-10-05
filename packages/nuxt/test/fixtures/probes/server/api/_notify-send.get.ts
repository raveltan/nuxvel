import { z } from "zod";

const query = z.object({ userId: z.string(), name: z.string() });

export default defineEventHandler(async (event) => {
  const { userId, name } = query.parse(getQuery(event));

  await notify(userId, "welcome", { name });

  return { ok: true };
});
