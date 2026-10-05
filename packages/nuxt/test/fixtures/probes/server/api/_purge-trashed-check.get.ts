import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { userTable } from "~~/server/database/schema/auth.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";

export default defineEventHandler(async () => {
  const authorId = randomUUID();
  await useDb().insert(userTable).values({ id: authorId, name: "Purge", email: `${authorId}@example.com` });
  await useDb()
    .insert(postsTable)
    .values([
      { title: "live", body: "", authorId },
      { title: "trashed long ago", body: "", authorId, deletedAt: sql`now() - interval '40 days'` },
      { title: "trashed today", body: "", authorId, deletedAt: sql`now()` },
    ]);
  const titles = async () =>
    (await useDb().select({ title: postsTable.title }).from(postsTable).where(eq(postsTable.authorId, authorId)))
      .map((row) => row.title)
      .sort();

  const withoutSetting = await purgeTrashed();
  const afterNoop = await titles();
  const purged = await purgeTrashed("30 days");

  return { withoutSetting, afterNoop, purged, remaining: await titles() };
});
