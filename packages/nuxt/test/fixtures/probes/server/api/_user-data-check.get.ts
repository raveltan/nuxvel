import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { createPostAction } from "~~/server/actions/posts/create-post.action";
import { apiKeysTable } from "~~/server/database/schema/api-keys.schema";
import { auditContextTable, auditLogTable, auditSubjectsTable } from "~~/server/database/schema/audit-log.schema";
import { userTable } from "~~/server/database/schema/auth.schema";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { notificationsTable } from "~~/server/database/schema/notifications.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";

async function createUserWithData(name: string) {
  const owner = await useDb()
    .insert(userTable)
    .values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` })
    .returning()
    .then(firstOrFail);
  const actor = userActor(owner);

  await createPostAction({ title: `${name} one`, body: "first" }, { actor });
  await createPostAction({ title: `${name} two`, body: "second" }, { actor });
  await useDb().insert(healthChecksTable).values({ name: `${name} check`, userId: owner.id });
  await useDb().insert(healthChecksTable).values({ name: owner.id });
  await $notifications.welcome.notify(owner.id, { name });

  return owner;
}

export default defineEventHandler(async () => {
  const erased = await createUserWithData("Erased");
  const key = await useDb()
    .insert(apiKeysTable)
    .values({ userId: erased.id, name: "Erased key", keyHash: randomUUID() })
    .returning()
    .then(firstOrFail);
  await createPostAction({ title: "Erased by key", body: "third" }, { actor: apiKeyActor(key) });
  const kept = await createUserWithData("Kept");
  await softDelete(postsTable, eq(postsTable.title, "Erased two"));

  const [erasedSubject] = await useDb().select().from(auditSubjectsTable).where(eq(auditSubjectsTable.userId, erased.id));
  const subjectId = erasedSubject?.id ?? "";
  const contextOfErased = () =>
    useDb()
      .select()
      .from(auditContextTable)
      .where(inArray(auditContextTable.entryId, useDb().select({ id: auditLogTable.id }).from(auditLogTable).where(inArray(auditLogTable.actorId, [subjectId, key.id]))));
  const contextBefore = await contextOfErased();
  const archive = await exportUserData(erased.id);
  const counts = await eraseUserData(erased.id);

  const remaining = {
    user: await useDb().select().from(userTable).where(eq(userTable.id, erased.id)),
    posts: await useDb().select().from(postsTable).where(eq(postsTable.authorId, erased.id)),
    healthChecks: await useDb()
      .select()
      .from(healthChecksTable)
      .where(or(eq(healthChecksTable.userId, erased.id), eq(healthChecksTable.name, erased.id))),
    notifications: await useDb().select().from(notificationsTable).where(eq(notificationsTable.userId, erased.id)),
  };
  const keptPosts = await useDb().select().from(postsTable).where(eq(postsTable.authorId, kept.id));
  const auditTrail = await useDb()
    .select({ action: auditLogTable.action, actorType: auditLogTable.actorType, metadata: auditLogTable.metadata })
    .from(auditLogTable)
    .where(eq(auditLogTable.targetId, subjectId));
  const authoredAudit = await useDb()
    .select({ action: auditLogTable.action })
    .from(auditLogTable)
    .where(eq(auditLogTable.actorId, subjectId));

  return {
    erasedId: erased.id,
    archive,
    counts,
    remaining: Object.values(remaining).map((rows) => rows.length),
    keptPosts: keptPosts.length,
    auditTrail,
    authoredAudit: authoredAudit.map((row) => row.action),
    contextBefore: contextBefore.length,
    contextAfter: (await contextOfErased()).length,
    subjectsAfter: (await useDb().select().from(auditSubjectsTable).where(eq(auditSubjectsTable.userId, erased.id))).length,
  };
});
