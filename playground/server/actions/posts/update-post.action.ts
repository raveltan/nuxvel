import { postsTable } from "#nuxvel/schema";
import { updatePostInput } from "#shared/schemas/post";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { findAuthorized } from "@nuxvel/nuxt/server/authorization";
import { updateOne } from "@nuxvel/nuxt/server/database";

export const updatePostAction = defineAction({
  input: updatePostInput,
  audit: { name: "post.updated", target: postsTable },
  invalidates: ["post"],
  errors: {
    "post.body-empty": { message: "Body cannot be empty after trimming", field: "body" },
  },
  handler: async (input, _ctx, fail) => {
    await findAuthorized(postsTable, input.id, "update");

    if (!input.body.trim()) fail("post.body-empty");

    return updateOne(postsTable, input.id, { title: input.title, body: input.body });
  },
});
