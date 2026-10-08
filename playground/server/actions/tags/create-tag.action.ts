import { tagsTable } from "#nuxvel/schema";
import { createTagInput } from "#shared/schemas/tag";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { insertOne } from "@nuxvel/nuxt/server/database";

export const createTagAction = defineAction({
  input: createTagInput,
  handler: async (input) => insertOne(tagsTable, input),
});
