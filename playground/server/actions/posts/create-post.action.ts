import { postsTable } from "#nuxvel/schema";

export const createPostAction = defineAction({
  input: createPostInput,
  invalidates: ["post"],
  handler: async (input, ctx) => {
    const post = await useDb()
      .insert(postsTable)
      .values({ title: input.title, body: input.body, authorId: ctx.actor.userId ?? ctx.actor.id })
      .returning()
      .then(firstOrFail);

    await audit("post.created", { type: "posts", id: post.id });
    await dispatchAfterCommit("post.notify-followers", { postId: post.id });
    await broadcastAfterCommit("posts", "created", post);

    return post;
  },
});
