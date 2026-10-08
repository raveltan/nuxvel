import { postsTable } from "#nuxvel/schema";
import { postIdInput } from "#shared/schemas/post";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { findAuthorized } from "@nuxvel/nuxt/server/authorization";
import { restore } from "@nuxvel/nuxt/server/database";

export const restorePostAction = defineAction({
  input: postIdInput,
  audit: { name: "post.restored", target: postsTable },
  invalidates: ["post"],
  handler: async (input) => {
    await findAuthorized(postsTable, input.id, "restore", { trashed: "only" });

    return restore(postsTable, input.id);
  },
});
