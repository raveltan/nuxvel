import { runAction } from "@nuxvel/nuxt/testing";
import { z } from "zod";
import * as testNamespaces from "#build/nuxvel/test-namespaces.mjs";
import { postsTable } from "~~/server/database/schema/posts.schema";

type IsAny<T> = 0 extends 1 & T ? true : false;

const splitTags = defineAction({
  input: z.object({ tags: z.string().transform((tags) => tags.split(",")) }),
  handler: (input) => input.tags,
});

type SplitTagsInput = Parameters<typeof splitTags>[0];

export const takesSchemaInput: SplitTagsInput = { tags: "news,tech" };

// @ts-expect-error the callable takes the schema's input, not its parsed output
export const rejectsParsedOutput: SplitTagsInput = { tags: ["news"] };

export const inputIsTyped: IsAny<SplitTagsInput> extends true ? never : true = true;

export const returnsHandlerOutput: Awaited<ReturnType<typeof splitTags>> extends string[]
  ? true
  : never = true;

const archivePost = defineAction({
  input: z.object({ id: z.number() }),
  errors: { "post.archived": "This post is already archived." },
  handler: (_input, _ctx, fail) => fail("post.archived"),
});

export const failureOnAField = defineAction({
  input: z.object({ id: z.number() }),
  errors: { "post.missing": { message: "No such post", field: "id" } },
  handler: (_input, _ctx, fail) => fail("post.missing"),
});

export const failureOnAnUnknownField = defineAction({
  input: z.object({ id: z.number() }),
  // @ts-expect-error the field of a failure is a key of the input schema
  errors: { "post.missing": { message: "No such post", field: "slug" } },
  handler: (_input, _ctx, fail) => fail("post.missing"),
});

export const noErrorsDeclared = defineAction({
  // @ts-expect-error an action that declares no errors cannot fail() with a code
  handler: (_input, _ctx, fail) => fail("anything"),
});

declare const caught: unknown;

export const declaredCode: "post.archived" | undefined = isActionError(
  caught,
  archivePost,
  "post.archived",
)
  ? caught.actionCode
  : undefined;

// @ts-expect-error the action does not declare this code
export const undeclaredCode = isActionError(caught, archivePost, "post.locked");

export const errorCodesAreTyped: ActionErrorCode<typeof archivePost> extends "post.archived"
  ? true
  : never = true;

type NamespacedAction = typeof $actions.posts.createPost;

export const actionsNamespaceIsTyped: IsAny<NamespacedAction> extends true
  ? never
  : NamespacedAction extends { readonly actionName: string }
    ? true
    : never = true;

export async function runActionTakesADefinitionOrATestStub() {
  const actingAs = { id: "user-1" };
  const post = await runAction(testNamespaces.$actions.posts.createPost, { title: "Hi", body: "" }, { actingAs });
  const postId: number = post.id;
  const postIdIsTyped: IsAny<typeof post.id> extends true ? never : true = true;

  await runAction($actions.posts.createPost, { title: "Hi", body: "" }, { actingAs });

  // @ts-expect-error the definition's input needs a title
  await runAction(testNamespaces.$actions.posts.createPost, { body: "" }, { actingAs });

  return { postId, postIdIsTyped };
}

export const invalidatesFromTheResult = defineAction({
  input: z.object({ id: z.number() }),
  handler: ({ id }) => ({ id, slug: "post" }),
  invalidates: (post, input) => {
    const typed: IsAny<typeof post> extends true ? never : typeof post extends { slug: string } ? true : never = true;
    const parsed: typeof input extends { id: number } ? true : never = true;

    return typed && parsed ? [["posts", post.slug], "posts:*"] : [];
  },
});

export const invalidatesTakesTags = defineAction({
  // @ts-expect-error a tag is a string or an array of parts
  invalidates: [1],
  handler: () => null,
});

const noInputAction = defineAction({ handler: () => 1 });

export async function callsWithoutInput() {
  return [await noInputAction({}), await noInputAction(undefined)];
}

export const auditsReturnedRow = defineAction({
  audit: "post.created",
  handler: () => ({ id: 1 }),
});

export const auditWithoutReturnedId = defineAction({
  // @ts-expect-error audit: "<name>" targets the returned row, so the handler must return one with an id
  audit: "post.created",
  handler: () => undefined,
});

export const auditTargetWithoutInputId = defineAction({
  input: z.object({ title: z.string() }),
  // @ts-expect-error audit: { name, target } loads the row with the id input.id, so the input must have one
  audit: { name: "post.updated", target: postsTable },
  handler: () => ({ id: 1 }),
});
