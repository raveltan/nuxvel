import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "#nuxvel/schema";
import { postsTable } from "#nuxvel/schema";

export const accountRouter = {
  posts: authedProcedure
    .output(z.array(z.object({ id: z.number(), title: z.string(), createdAt: z.date() })))
    .query(({ ctx }) =>
      useDb()
        .select({ id: postsTable.id, title: postsTable.title, createdAt: postsTable.createdAt })
        .from(postsTable)
        .where(and(eq(postsTable.authorId, ctx.user.id), notTrashed(postsTable)))
        .orderBy(desc(postsTable.id))
        .limit(20),
    ),
  signUps: adminProcedure
    .output(z.array(z.object({ id: z.string(), email: z.string(), createdAt: z.date() })))
    .query(() =>
      useDb()
        .select({ id: userTable.id, email: userTable.email, createdAt: userTable.createdAt })
        .from(userTable)
        .orderBy(desc(userTable.createdAt))
        .limit(50),
    ),
};
