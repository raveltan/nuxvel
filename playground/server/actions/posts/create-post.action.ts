import { postsTable } from "#nuxvel/schema";
import { postsChannel } from "#server/channels/posts.channel";
import { postNotifyFollowersJob } from "#server/jobs/post/notify-followers.job";
import { createPostInput } from "#shared/schemas/post";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { ForbiddenError } from "@nuxvel/nuxt/server/api";
import { audit } from "@nuxvel/nuxt/server/audit";
import { insertOne } from "@nuxvel/nuxt/server/database";

export const createPostAction = defineAction({
  input: createPostInput,
  invalidates: ["post"],
  handler: async (input, { actor }) => {
    if (!actor.userId) throw new ForbiddenError("This action needs a user");

    const post = await insertOne(postsTable, { title: input.title, body: input.body, authorId: actor.userId });

    await audit("post.created", { type: "posts", id: post.id });
    await postNotifyFollowersJob.dispatch({ postId: post.id });
    await postsChannel.broadcast("created", post);

    return post;
  },
});
