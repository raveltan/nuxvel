import { eq } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "../../database/schema/auth.schema";

export const sendTestNotificationAction = defineAction({
  input: z.object({}),
  handler: async (_input, ctx) => {
    const recipient = await useDb()
      .select()
      .from(userTable)
      .where(eq(userTable.id, ctx.actor.id))
      .then(firstOrFail);

    await notify(recipient.id, "welcome", { name: recipient.name });
  },
});
