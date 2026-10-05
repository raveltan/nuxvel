import { postsTable } from "../database/schema/posts.schema";

export const postsUserData = defineUserData(postsTable, postsTable.authorId);
