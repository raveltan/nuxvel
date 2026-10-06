import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { userTable } from "~~/server/database/schema/auth.schema";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";

async function notFound(write: () => Promise<unknown>) {
  try {
    await write();
    return false;
  } catch (error) {
    return error instanceof NotFoundError;
  }
}

export default defineEventHandler(async () => {
  const inserted = await insertOne(healthChecksTable, { name: "inserted" });
  const updated = await updateOne(healthChecksTable, inserted.id, { name: "updated" });

  const authorId = randomUUID();
  await insertOne(userTable, { id: authorId, name: "Write One", email: `${authorId}@example.com` });
  const trashed = await insertOne(postsTable, { title: "trashed", body: "", authorId });
  await softDelete(postsTable, eq(postsTable.id, trashed.id));

  let rolledBack: number | undefined;
  await transaction(async () => {
    rolledBack = (await insertOne(healthChecksTable, { name: "rolled back" })).id;
    throw new Error("rollback");
  }).catch(() => undefined);

  return {
    inserted: { name: inserted.name, hasId: typeof inserted.id === "number" },
    updated: { id: updated.id === inserted.id, name: updated.name },
    missingNotFound: await notFound(() => updateOne(healthChecksTable, -1, { name: "missing" })),
    trashedNotFound: await notFound(() => updateOne(postsTable, trashed.id, { title: "edited" })),
    rolledBack: rolledBack !== undefined && (await useDb().select().from(healthChecksTable).where(eq(healthChecksTable.id, rolledBack))).length === 0,
  };
});
