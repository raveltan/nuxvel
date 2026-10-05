import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { userTable } from "../../database/schema/auth.schema";
import { setAvatarInput } from "../../../shared/schemas/profile";

export const setAvatarAction = defineAction({
  input: setAvatarInput,
  handler: async ({ key }, ctx) => {
    const avatarKey = await promoteUpload({
      upload: "profile-avatar",
      key,
      to: `avatars/${ctx.actor.id}/${randomUUID()}`,
    });

    const updated = await useDb()
      .update(userTable)
      .set({ image: avatarKey })
      .where(eq(userTable.id, ctx.actor.id))
      .returning()
      .then(firstOrFail);

    await audit("user.avatar-changed", updated);

    return { key: avatarKey };
  },
});
