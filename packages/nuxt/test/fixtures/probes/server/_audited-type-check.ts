import { z } from "zod";
import { userTable } from "~~/server/database/schema/auth.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";

export const onAuthedWithId = authedProcedure
  .input(z.object({ id: z.number(), title: z.string() }))
  .use(audited("post.updated", { target: postsTable }))
  .mutation(() => null);

export const onPublic = publicProcedure
  .input(z.object({ id: z.number() }))
  // @ts-expect-error audited() needs ctx.actor, which only authedProcedure has
  .use(audited("post.updated", { target: postsTable }))
  .mutation(() => null);

export const withoutId = authedProcedure
  .input(z.object({ title: z.string() }))
  // @ts-expect-error audited() reads input.id, so the input must have one
  .use(audited("post.updated", { target: postsTable }))
  .mutation(() => null);

export const withTextId = authedProcedure
  .input(z.object({ id: z.string() }))
  // @ts-expect-error posts.id is serial, so audited() on posts needs a numeric id
  .use(audited("post.updated", { target: postsTable }))
  .mutation(() => null);

export const onTextIdTable = authedProcedure
  .input(z.object({ id: z.string() }))
  .use(audited("user.updated", { target: userTable }))
  .mutation(() => null);

export const numericIdOnTextIdTable = authedProcedure
  .input(z.object({ id: z.number() }))
  // @ts-expect-error user.id is text, so audited() on user needs a string id
  .use(audited("user.updated", { target: userTable }))
  .mutation(() => null);
