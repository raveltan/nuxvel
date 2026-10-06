import { eq } from "drizzle-orm";
import { postsTable } from "#nuxvel/schema";

export const deletePostAction = defineAction({
  input: postIdInput,
  invalidates: ["posts:*"],
  handler: async (input, ctx) => {
    const post = await findOrFail(postsTable, input.id);
    await authorize(ctx.actor, "delete", postsTable, post);

    await softDelete(postsTable, eq(postsTable.id, input.id));

    return { id: post.id };
  },
});
