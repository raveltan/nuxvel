import { eq } from "drizzle-orm";
import { userTable } from "#nuxvel/schema";
import { welcomeMail } from "#server/mail/welcome.mail";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { firstOrFail, useDb } from "@nuxvel/nuxt/server/database";

export const sendTestMailAction = defineAction({
  handler: async (_input, ctx) => {
    const recipient = await useDb()
      .select()
      .from(userTable)
      .where(eq(userTable.id, ctx.actor.id))
      .then(firstOrFail);

    await welcomeMail.send({ to: recipient.email, name: recipient.name });

    return { to: recipient.email };
  },
});
