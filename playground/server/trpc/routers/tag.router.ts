import { createTagAction } from "#server/actions/tags/create-tag.action";
import { createTagInput, tagSchema } from "#shared/schemas/tag";
import { systemActor } from "@nuxvel/nuxt/server/actions";
import { publicProcedure } from "@nuxvel/nuxt/server/api";

export const tagRouter = {
  create: publicProcedure
    .input(createTagInput)
    .output(tagSchema)
    .mutation(({ input }) => createTagAction(input, { actor: systemActor("playground") })),
};
