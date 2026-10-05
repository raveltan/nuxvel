import { and, desc, getTableColumns, inArray } from "drizzle-orm";
import { z } from "zod";
import { createPostAction } from "../../actions/posts/create-post.action";
import { deletePostAction } from "../../actions/posts/delete-post.action";
import { restorePostAction } from "../../actions/posts/restore-post.action";
import { updatePostAction } from "../../actions/posts/update-post.action";
import { userTable } from "../../database/schema/auth.schema";
import { postsTable } from "../../database/schema/posts.schema";
import { postPolicy } from "../../policies/post.policy";
import {
  createPostInput,
  postIdInput,
  postSchema,
  updatePostInput,
} from "../../../shared/schemas/post";

const { searchVector: _searchVector, ...postColumns } = getTableColumns(postsTable);

const postOutputSchema = postSchema.extend({ deletedAt: z.coerce.date().nullable() });

export const postRouter = {
  list: publicProcedure
    .meta({ openapi: { method: "GET", path: "/posts", summary: "List posts", tags: ["posts"], protect: false } })
    .input(paginationSchema.optional())
    .output(paginated(postOutputSchema))
    .query(({ input }) => {
      const q = input?.q ?? "";

      return remember(`posts:list:${JSON.stringify([input?.page, input?.perPage, input?.q])}`, { minutes: 5 }, () =>
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
    .meta({ openapi: { method: "GET", path: "/posts/{id}", summary: "Get a post", tags: ["posts"], protect: false } })
    .input(postIdInput)
    .output(postOutputSchema)
    .query(({ input }) => findOrFail(postsTable, input.id)),
  abilities: authedProcedure
    .input(postIdInput)
    .output(z.object({ update: z.boolean(), delete: z.boolean() }))
    .query(async ({ input, ctx }) => {
      const post = await findOrFail(postsTable, input.id);

      return {
        update: await can(ctx.actor, "update", postsTable, post),
        delete: await can(ctx.actor, "delete", postsTable, post),
      };
    }),
  withAuthors: publicProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()) }))
    .output(z.array(z.object({ id: z.number(), author: z.string().optional() })))
    .query(async ({ input }) => {
      const rows = await useDb().select(postColumns).from(postsTable).where(inArray(postsTable.id, input.ids)).orderBy(postsTable.id);

      return Promise.all(
        rows.map(async (post) => ({ id: post.id, author: (await loader(userTable).load(post.authorId))?.name })),
      );
    }),
  abilitiesMany: authedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()) }))
    .output(z.array(z.object({ id: z.number(), can: z.record(z.string(), z.boolean()).optional() })))
    .query(async ({ input, ctx }) => {
      const rows = await useDb().select().from(postsTable).where(inArray(postsTable.id, input.ids)).orderBy(postsTable.id);
      const abilities = await canMany(ctx.actor, [postPolicy.update, postPolicy.delete], rows);

      return rows.map((post, index) => ({ id: post.id, can: abilities[index] }));
    }),
  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/posts", summary: "Create a post", tags: ["posts"] } })
    .use(idempotent())
    .input(createPostInput)
    .output(postOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const post = await createPostAction(input, { actor: ctx.actor });
      flash("Post created");
      return post;
    }),
  update: authedProcedure
    .input(updatePostInput)
    .output(postOutputSchema)
    .use(audited("post.updated", { target: postsTable }))
    .mutation(({ input, ctx }) =>
      updatePostAction(input, { actor: ctx.actor }),
    ),
  delete: authedProcedure
    .input(postIdInput)
    .output(postIdInput)
    .use(audited("post.deleted", { target: postsTable }))
    .mutation(({ input, ctx }) =>
      deletePostAction(input, { actor: ctx.actor }),
    ),
  restore: authedProcedure
    .input(postIdInput)
    .output(postOutputSchema)
    .use(audited("post.restored", { target: postsTable }))
    .mutation(({ input, ctx }) =>
      restorePostAction(input, { actor: ctx.actor }),
    ),
};
