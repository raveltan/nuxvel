import { tagsTable } from "#nuxvel/schema";

export const createTagAction = defineAction({
  input: createTagInput,
  handler: async (input) => insertOne(tagsTable, input),
});
