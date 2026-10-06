import { eq } from "drizzle-orm";
import { userTable } from "#nuxvel/schema";

export const sendTestMailAction = defineAction({
  handler: async (_input, ctx) => {
    const recipient = await useDb()
      .select()
      .from(userTable)
      .where(eq(userTable.id, ctx.actor.id))
      .then(firstOrFail);

    await sendMail("welcome", { to: recipient.email, name: recipient.name });

    return { to: recipient.email };
  },
});
