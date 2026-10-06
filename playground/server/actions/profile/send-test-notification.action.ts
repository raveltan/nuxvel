import { eq } from "drizzle-orm";
import { userTable } from "#nuxvel/schema";

export const sendTestNotificationAction = defineAction({
  handler: async (_input, ctx) => {
    const recipient = await useDb()
      .select()
      .from(userTable)
      .where(eq(userTable.id, ctx.actor.id))
      .then(firstOrFail);

    await notify(recipient.id, "welcome", { name: recipient.name });
  },
});
