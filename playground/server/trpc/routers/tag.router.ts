import { createTagAction } from "#server/actions/tags/create-tag.action";

export const tagRouter = {
  create: publicProcedure
    .input(createTagInput)
    .output(tagSchema)
    .mutation(({ input }) => createTagAction(input, { actor: systemActor("playground") })),
};
