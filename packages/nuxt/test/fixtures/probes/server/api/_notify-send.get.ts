import { z } from "zod";
import { welcomeNotification } from "#server/notifications/welcome.notification";

const query = z.object({ userId: z.string(), name: z.string() });

export default defineEventHandler(async (event) => {
  const { userId, name } = query.parse(getQuery(event));

  await welcomeNotification.notify(userId, { name });

  return { ok: true };
});
