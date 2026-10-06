import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendTestMailAction } from "#server/actions/profile/send-test-mail.action";
import { sendTestNotificationAction } from "#server/actions/profile/send-test-notification.action";
import { setAvatarAction } from "#server/actions/profile/set-avatar.action";
import { userTable } from "#nuxvel/schema";

export const profileRouter = {
  me: authedProcedure
    .meta({ openapi: { method: "GET", path: "/me", summary: "The signed-in user", tags: ["profile"] } })
    .output(z.object({ name: z.string(), email: z.string(), avatarUrl: z.string().nullable() }))
    .query(async ({ ctx }) => {
      const me = await useDb()
        .select()
        .from(userTable)
        .where(eq(userTable.id, ctx.user.id))
        .then(firstOrFail);

      return { name: me.name, email: me.email, avatarUrl: me.image ? await signedReadUrl(me.image) : null };
    }),
  setAvatar: authedProcedure
    .input(setAvatarInput)
    .output(z.object({ key: z.string() }))
    .mutation(({ input, ctx }) =>
      setAvatarAction(input, { actor: ctx.actor }),
    ),
  sendTestMail: authedProcedure.output(z.object({ to: z.string() })).mutation(({ ctx }) =>
    sendTestMailAction({}, { actor: ctx.actor }),
  ),
  sendTestNotification: authedProcedure.output(z.void()).mutation(({ ctx }) =>
    sendTestNotificationAction({}, { actor: ctx.actor }),
  ),
};
