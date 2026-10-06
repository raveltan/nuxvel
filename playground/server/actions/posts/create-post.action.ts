import { postsTable } from "#nuxvel/schema";

export const createPostAction = defineAction({
  input: createPostInput,
  invalidates: ["post"],
  handler: async (input, { actor }) => {
    if (!actor.userId) throw new ForbiddenError("This action needs a user");

    const post = await insertOne(postsTable, { title: input.title, body: input.body, authorId: actor.userId });

    await audit("post.created", { type: "posts", id: post.id });
    await $jobs.post.notifyFollowers.dispatch({ postId: post.id });
    await $channels.posts.broadcast("created", post);

    return post;
  },
});
