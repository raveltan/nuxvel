import { tagsTable } from "../../database/schema/tags.schema";

export const createTagAction = defineAction({
  input: createTagInput,
  handler: async (input) =>
    useDb().insert(tagsTable).values(input).returning().then(firstOrFail),
});
