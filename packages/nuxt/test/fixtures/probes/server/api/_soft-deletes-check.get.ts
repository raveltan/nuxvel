import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { userTable } from "~~/server/database/schema/auth.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";

async function notFound(find: () => Promise<unknown>) {
  try {
    await find();
    return false;
  } catch (error) {
    return error instanceof NotFoundError;
  }
}

export default defineEventHandler(async () => {
  const authorId = randomUUID();
  await useDb().insert(userTable).values({ id: authorId, name: "Soft", email: `${authorId}@example.com` });
  const insert = (title: string) =>
    useDb().insert(postsTable).values({ title, body: "", authorId }).returning().then(firstOrFail);
  const kept = await insert("kept");
  const trashed = await insert("trashed");
  const titles = async (scope: typeof notTrashed) =>
    (await useDb().select().from(postsTable).where(and(eq(postsTable.authorId, authorId), scope(postsTable)))).map((row) => row.title);

  const softDeleted = await softDelete(postsTable, eq(postsTable.id, trashed.id));
  const softDeletedAgain = await softDelete(postsTable, eq(postsTable.id, trashed.id));
  const listed = { notTrashed: await titles(notTrashed), onlyTrashed: await titles(onlyTrashed) };
  const found = {
    trashedByDefault: await notFound(() => findOrFail(postsTable, trashed.id)),
    trashedIncluded: (await findOrFail(postsTable, trashed.id, { trashed: "include" })).title,
    trashedOnly: (await findOrFail(postsTable, trashed.id, { trashed: "only" })).title,
    keptOnly: await notFound(() => findOrFail(postsTable, kept.id, { trashed: "only" })),
  };
  const restored = await restore(postsTable, eq(postsTable.id, trashed.id));
  const restoredAgain = await restore(postsTable, eq(postsTable.id, trashed.id));
  const forceDeleted = await forceDelete(postsTable, eq(postsTable.id, kept.id));

  return {
    softDeleted: softDeleted.map((row) => ({ title: row.title, trashed: row.deletedAt instanceof Date })),
    softDeletedAgain: softDeletedAgain.length,
    listed,
    found,
    restored: restored.map((row) => ({ title: row.title, deletedAt: row.deletedAt })),
    restoredAgain: restoredAgain.length,
    forceDeleted: forceDeleted.map((row) => row.title),
    forceDeletedGone: await notFound(() => findOrFail(postsTable, kept.id, { trashed: "include" })),
  };
});
