import { z } from "zod";

const body = z.object({ userId: z.string(), title: z.string(), rolledBackTitle: z.string() });

export default defineEventHandler(async (event) => {
  const { userId, title, rolledBackTitle } = body.parse(await readBody(event));

  await transaction(async () => {
    await sendPush(userId, { title: rolledBackTitle, body: "Never sent" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  await sendPush(userId, { title, body: "Ada commented on your post", url: "/posts/1" });

  return { ok: true };
});
