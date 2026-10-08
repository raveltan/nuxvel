import { randomUUID } from "node:crypto";
import { userTable } from "#nuxvel/schema";
import { setAvatarInput } from "#shared/schemas/profile";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { audit } from "@nuxvel/nuxt/server/audit";
import { updateOne } from "@nuxvel/nuxt/server/database";
import { promoteUpload } from "@nuxvel/nuxt/server/storage";

export const setAvatarAction = defineAction({
  input: setAvatarInput,
  handler: async ({ key }, ctx) => {
    const avatarKey = await promoteUpload({
      upload: "profile-avatar",
      key,
      to: `avatars/${ctx.actor.id}/${randomUUID()}`,
    });

    const updated = await updateOne(userTable, ctx.actor.id, { image: avatarKey });

    await audit("user.avatar-changed", updated);

    return { key: avatarKey };
  },
});
