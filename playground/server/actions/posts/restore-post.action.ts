import { eq } from "drizzle-orm";
import { postsTable } from "#nuxvel/schema";

export const restorePostAction = defineAction({
  input: postIdInput,
  invalidates: ["posts:*"],
  handler: async (input, ctx) => {
    const post = await findOrFail(postsTable, input.id, { trashed: "only" });
    await authorize(ctx.actor, "restore", postsTable, post);

    return restore(postsTable, eq(postsTable.id, input.id)).then(firstOrFail);
  },
});
