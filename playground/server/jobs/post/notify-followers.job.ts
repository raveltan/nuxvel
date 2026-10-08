import { z } from "zod";
import { postsTable } from "#nuxvel/schema";
import { findOrFail } from "@nuxvel/nuxt/server/database";
import { useLogger } from "@nuxvel/nuxt/server/observability";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export const postNotifyFollowersJob = defineJob({
  input: z.object({ postId: z.number().int().positive() }),
  handler: async ({ postId }) => {
    const post = await findOrFail(postsTable, postId);

    useLogger("post").info("would notify the followers", { postId: post.id });
  },
});
