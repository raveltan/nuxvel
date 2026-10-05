import { z } from "zod";
import { postsTable } from "../../database/schema/posts.schema";

export const postNotifyFollowersJob = defineJob({
  input: z.object({ postId: z.number().int().positive() }),
  handler: async ({ postId }) => {
    const post = await findOrFail(postsTable, postId);

    useLogger("post").info("would notify the followers", { postId: post.id });
  },
});
