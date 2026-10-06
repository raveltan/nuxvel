import { and, desc, getTableColumns, inArray } from "drizzle-orm";
import { z } from "zod";
import { createPostAction } from "#server/actions/posts/create-post.action";
import { userTable } from "#nuxvel/schema";
import { postsTable } from "#nuxvel/schema";

const { searchVector: _searchVector, ...postColumns } = getTableColumns(postsTable);

const postOutputSchema = postSchema.extend({ deletedAt: z.coerce.date().nullable() });

const postWithAbilities = withAbilities(postOutputSchema, [$policies.post.update, $policies.post.delete]);

export const postRouter = {
  list: publicProcedure
    .openapi({ path: "/posts", summary: "List posts", tags: ["posts"], protect: false })
    .input(paginationSchema.optional())
    .output(paginated(postWithAbilities))
    .query(({ input }) => {
      const q = input?.q ?? "";

      return remember(["post", "list", input ?? null], { minutes: 5 }, () =>
        paginate(
          useDb()
            .select(postColumns)
            .from(postsTable)
            .where(and(search(postsTable, q), notTrashed(postsTable)))
            .orderBy(desc(searchRank(postsTable, q)), desc(postsTable.createdAt), desc(postsTable.id))
            .$dynamic(),
          input,
        ),
      );
    }),
  feed: publicProcedure
    .input(z.object({ cursor: z.number().int().nullish(), limit: z.number().int().optional() }).optional())
    .output(z.object({ rows: z.array(postOutputSchema), nextCursor: z.number().nullable() }))
    .query(({ input }) =>
      paginateCursor(useDb().select(postColumns).from(postsTable).where(notTrashed(postsTable)).$dynamic(), {
        orderBy: "id",
        direction: "desc",
        cursor: input?.cursor,
        limit: input?.limit,
      }),
    ),
  byId: publicProcedure
    .openapi({ path: "/posts/{id}", summary: "Get a post", tags: ["posts"], protect: false })
    .input(postIdInput)
    .output(postWithAbilities)
    .query(({ input }) => findOrFail(postsTable, input.id)),
  withAuthors: publicProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()) }))
    .output(z.array(z.object({ id: z.number(), author: z.string().optional() })))
    .query(async ({ input }) => {
      const rows = await useDb().select(postColumns).from(postsTable).where(inArray(postsTable.id, input.ids)).orderBy(postsTable.id);

      return Promise.all(
        rows.map(async (post) => ({ id: post.id, author: (await loader(userTable).load(post.authorId))?.name })),
      );
    }),
  create: authedProcedure
    .openapi({ path: "/posts", summary: "Create a post", tags: ["posts"] })
    .use(idempotent())
    .input(createPostInput)
    .output(postOutputSchema)
    .mutation(async ({ input }) => {
      const post = await createPostAction(input);
      flash("Post created");
      return post;
    }),
  update: authedProcedure.output(postOutputSchema).action($actions.posts.updatePost),
  delete: authedProcedure.output(postIdInput).action($actions.posts.deletePost),
  restore: authedProcedure.output(postOutputSchema).action($actions.posts.restorePost),
};
