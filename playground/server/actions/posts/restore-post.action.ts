import { eq } from "drizzle-orm";
import { postsTable } from "../../database/schema/posts.schema";
import { postIdInput } from "../../../shared/schemas/post";

export const restorePostAction = defineAction({
  input: postIdInput,
  invalidates: ["posts:*"],
  handler: async (input, ctx) => {
    const post = await findOrFail(postsTable, input.id, { trashed: "only" });
    await authorize(ctx.actor, "restore", postsTable, post);

    return restore(postsTable, eq(postsTable.id, input.id)).then(firstOrFail);
  },
});
