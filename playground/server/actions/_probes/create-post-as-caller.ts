import { createPostAction } from "../posts/create-post.action";

export const createPostAsCaller = defineAction({
  input: createPostInput,
  handler: async (input) => createPostAction(input),
});
