import { postsTable } from "#nuxvel/schema";

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
