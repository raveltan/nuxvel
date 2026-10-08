import { postsTable } from "#nuxvel/schema";
import { postIdInput } from "#shared/schemas/post";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { findAuthorized } from "@nuxvel/nuxt/server/authorization";
import { softDelete } from "@nuxvel/nuxt/server/database";

export const deletePostAction = defineAction({
  input: postIdInput,
  audit: { name: "post.deleted", target: postsTable },
  invalidates: ["post"],
  handler: async (input) => {
    const post = await findAuthorized(postsTable, input.id, "delete");

    await softDelete(postsTable, input.id);

    return { id: post.id };
  },
});
