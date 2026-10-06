import { eq } from "drizzle-orm";
import { postsTable } from "#nuxvel/schema";

export const updatePostAction = defineAction({
  input: updatePostInput,
  invalidates: ["posts:*"],
  errors: {
    "post.body-empty": "Body cannot be empty after trimming",
  },
  handler: async (input, ctx, fail) => {
    const post = await findOrFail(postsTable, input.id);
    await authorize(ctx.actor, "update", postsTable, post);

    if (!input.body.trim()) fail("post.body-empty");

    const updated = await useDb()
      .update(postsTable)
      .set({ title: input.title, body: input.body })
      .where(eq(postsTable.id, input.id))
      .returning()
      .then(firstOrFail);

    return updated;
  },
});
