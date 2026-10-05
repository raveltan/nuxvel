import { z } from "zod";

const echo = probeNamed("_define-action-check.echo", defineAction({
  input: z.object({ name: z.string().min(3), age: z.number().min(18) }),
  handler: (input) => input,
}));

const splitTags = probeNamed("_define-action-check.split-tags", defineAction({
  input: z.object({ tags: z.string().transform((tags) => tags.split(",")) }),
  handler: (input) => input.tags,
}));

const claimHandle = probeNamed("_define-action-check.claim-handle", defineAction({
  input: z.object({
    handle: z.string().refine(async (handle) => handle !== "taken", "That handle is taken"),
  }),
  handler: (input) => input.handle,
}));

async function fieldsOf(call: () => Promise<unknown>) {
  try {
    await call();
    return undefined;
  } catch (error) {
    return isTaxonomyError(error, "BAD_REQUEST") ? error.fields : undefined;
  }
}

export default defineEventHandler(async () => {
  const actor = systemActor("_define-action-check");
  const valid = await echo({ name: "Ravel", age: 30 }, { actor });
  const transformed = await splitTags({ tags: "news,tech" }, { actor });
  const claimed = await claimHandle({ handle: "ravel" }, { actor });
  const refusedFields = await fieldsOf(() => claimHandle({ handle: "taken" }, { actor }));

  try {
    await echo({ name: "a", age: 5 }, { actor });
    return { valid, transformed, claimed, refusedFields, invalidThrew: false };
  } catch (error) {
    return {
      valid,
      transformed,
      claimed,
      refusedFields,
      invalidThrew: true,
      fields: error instanceof ValidationFailedError ? error.fields : undefined,
    };
  }
});
