import { eq } from "drizzle-orm";
import { postsTable } from "~~/server/database/schema/posts.schema";
import { useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  for (let id = 1; id <= 5; id += 1) {
    await useDb().select().from(postsTable).where(eq(postsTable.id, id));
  }

  throw new Error("handler exploded after a loop");
});
