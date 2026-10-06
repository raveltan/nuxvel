import { z } from "zod";

const query = z.object({ userId: z.string(), name: z.string() });

export default defineEventHandler(async (event) => {
  const { userId, name } = query.parse(getQuery(event));

  await $notifications.welcome.notify(userId, { name });

  return { ok: true };
});
