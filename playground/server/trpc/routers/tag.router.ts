import { createTagAction } from "../../actions/tags/create-tag.action";
import { createTagInput, tagSchema } from "../../../shared/schemas/tag";

export const tagRouter = {
  create: publicProcedure
    .input(createTagInput)
    .output(tagSchema)
    .mutation(({ input }) => createTagAction(input, { actor: systemActor("playground") })),
};
