import { defineFactory } from "@nuxvel/nuxt/factories";
import { postsTable } from "../database/schema/posts.schema";
import { userFactory } from "./users.factory";

export const postFactory = defineFactory(postsTable, {
  authorId: async () => (await userFactory()).id,
});
