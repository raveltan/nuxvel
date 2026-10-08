import { createPostInput, updatePostInput } from "#shared/schemas/post";
import { toValidationError } from "@nuxvel/nuxt/server/api";

export default defineEventHandler(() => {
  const validCreate = createPostInput.safeParse({
    title: "Hello",
    body: "World",
  });
  const invalidCreate = createPostInput.safeParse({ title: "", body: "" });

  const validUpdate = updatePostInput.safeParse({
    id: 1,
    title: "Hello",
    body: "World",
  });
  const invalidUpdate = updatePostInput.safeParse({
    id: "not-a-number",
    title: "",
    body: "",
  });

  return {
    validCreateSucceeded: validCreate.success,
    invalidCreateError: invalidCreate.success
      ? null
      : toValidationError(invalidCreate.error),
    validUpdateSucceeded: validUpdate.success,
    invalidUpdateError: invalidUpdate.success
      ? null
      : toValidationError(invalidUpdate.error),
  };
});
