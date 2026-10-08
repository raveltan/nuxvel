import { z } from "zod";
import { welcomeNotification } from "#server/notifications/welcome.notification";
import { ValidationFailedError } from "@nuxvel/nuxt/server/api";
import { transaction } from "@nuxvel/nuxt/server/database";

const query = z.object({ userId: z.string() });

export default defineEventHandler(async (event) => {
  const { userId } = query.parse(getQuery(event));

  await transaction(async () => {
    await welcomeNotification.notify(userId, { name: "Ada" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  const invalid = await welcomeNotification.notify(userId, { name: "" }).then(
    () => false,
    (error) => error instanceof ValidationFailedError,
  );

  return { invalid };
});
