import { eq } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "#nuxvel/schema";

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
  setAvatar: authedProcedure.output(z.object({ key: z.string() })).action($actions.profile.setAvatar),
  sendTestMail: authedProcedure.output(z.object({ to: z.string() })).action($actions.profile.sendTestMail),
  sendTestNotification: authedProcedure.output(z.void()).action($actions.profile.sendTestNotification),
};
