import { postsTable } from "~~/server/database/schema/posts.schema";

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event);
  const text = typeof q === "string" ? q : "";

  return useDb()
    .select({ id: postsTable.id, snippet: highlight(postsTable.body, text) })
    .from(postsTable)
    .where(search(postsTable, text));
});
