import { eq } from "drizzle-orm";
import { z } from "zod";
import { postsTable } from "#nuxvel/schema";

export const assignPostAuthor = defineAction({
  input: z.object({ postId: z.number(), authorId: z.string() }),
  handler: async ({ postId, authorId }) => {
    await useDb().update(postsTable).set({ authorId }).where(eq(postsTable.id, postId));
  },
});
