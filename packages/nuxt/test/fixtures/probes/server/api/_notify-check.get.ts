import { z } from "zod";

const query = z.object({ userId: z.string() });

export default defineEventHandler(async (event) => {
  const { userId } = query.parse(getQuery(event));

  await transaction(async () => {
    await notify(userId, "welcome", { name: "Ada" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  const invalid = await notify(userId, $notifications.welcome, { name: "" }).then(
    () => false,
    (error) => error instanceof ValidationFailedError,
  );

  return { invalid };
});
