import { postsTable } from "#nuxvel/schema";

export const restorePostAction = defineAction({
  input: postIdInput,
  audit: { name: "post.restored", target: postsTable },
  invalidates: ["post"],
  handler: async (input) => {
    await findAuthorized(postsTable, input.id, "restore", { trashed: "only" });

    return restore(postsTable, input.id);
  },
});
