import { eq } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "#nuxvel/schema";
import { sendTestMailAction } from "#server/actions/profile/send-test-mail.action";
import { sendTestNotificationAction } from "#server/actions/profile/send-test-notification.action";
import { setAvatarAction } from "#server/actions/profile/set-avatar.action";
import { authedProcedure } from "@nuxvel/nuxt/server/api";
import { firstOrFail, useDb } from "@nuxvel/nuxt/server/database";
import { signedReadUrl } from "@nuxvel/nuxt/server/storage";

export const profileRouter = {
  me: authedProcedure
    .openapi({ path: "/me", summary: "The signed-in user", tags: ["profile"] })
    .output(z.object({ name: z.string(), email: z.string(), avatarUrl: z.string().nullable() }))
    .query(async ({ ctx }) => {
      const me = await useDb()
        .select()
        .from(userTable)
        .where(eq(userTable.id, ctx.user.id))
        .then(firstOrFail);

      return { name: me.name, email: me.email, avatarUrl: me.image ? await signedReadUrl(me.image) : null };
    }),
  setAvatar: authedProcedure.output(z.object({ key: z.string() })).action(setAvatarAction),
  sendTestMail: authedProcedure.output(z.object({ to: z.string() })).action(sendTestMailAction),
  sendTestNotification: authedProcedure.output(z.void()).action(sendTestNotificationAction),
};
