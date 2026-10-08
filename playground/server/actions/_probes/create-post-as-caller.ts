import { createPostAction } from "../posts/create-post.action";
import { createPostInput } from "#shared/schemas/post";
import { defineAction } from "@nuxvel/nuxt/server/actions";

export const createPostAsCaller = defineAction({
  input: createPostInput,
  handler: async (input) => createPostAction(input),
});
