import { eq } from "drizzle-orm";
import { userTable } from "#nuxvel/schema";
import { welcomeNotification } from "#server/notifications/welcome.notification";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { firstOrFail, useDb } from "@nuxvel/nuxt/server/database";

export const sendTestNotificationAction = defineAction({
  handler: async (_input, ctx) => {
    const recipient = await useDb()
      .select()
      .from(userTable)
      .where(eq(userTable.id, ctx.actor.id))
      .then(firstOrFail);

    await welcomeNotification.notify(recipient.id, { name: recipient.name });
  },
});
