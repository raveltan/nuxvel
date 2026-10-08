import { randomUUID } from "node:crypto";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import { auditContextTable, auditLogTable, auditSubjectsTable } from "~~/server/database/schema/audit-log.schema";
import { userTable } from "~~/server/database/schema/auth.schema";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { audit, verifyAuditChain } from "@nuxvel/nuxt/server/audit";
import { firstOrFail, useDb } from "@nuxvel/nuxt/server/database";

const post = probeNamed("_audit-attribution-check.post", defineAction({
  handler: () => audit("post.created", { id: 1 }),
}));

async function failure(statement: SQL) {
  try {
    await useDb().execute(statement);
    return undefined;
  } catch (error) {
    return error instanceof Error ? String(error.cause ?? error.message) : String(error);
  }
}

async function addUser(name: string) {
  const person = await useDb()
    .insert(userTable)
    .values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` })
    .returning()
    .then(firstOrFail);

  await post({}, { actor: { type: "user", id: person.id } });

  return person.id;
}

export default defineEventHandler(async () => {
  const aliceId = await addUser("Alice");
  const malloryId = await addUser("Mallory");
  const db = useDb();

  const subjects = await db.select().from(auditSubjectsTable);
  const [alice, mallory] = [aliceId, malloryId].map((userId) => {
    const subject = subjects.find((row) => row.userId === userId);
    if (!subject) throw new Error("expected a subject");
    return subject;
  });
  if (!alice || !mallory) throw new Error("expected two subjects");

  const aliceEntry = await db.select().from(auditLogTable).where(eq(auditLogTable.actorId, alice.id)).then(firstOrFail);
  const aliceContext = await db.select().from(auditContextTable).where(eq(auditContextTable.entryId, aliceEntry.id)).then(firstOrFail);
  const malloryContexts = await db.select().from(auditContextTable).where(
    inArray(auditContextTable.entryId, db.select({ id: auditLogTable.id }).from(auditLogTable).where(eq(auditLogTable.actorId, mallory.id))),
  );

  const intact = await verifyAuditChain();

  await db.delete(auditSubjectsTable);
  await db.insert(auditSubjectsTable).values([
    { ...alice, userId: mallory.userId, displayName: mallory.displayName },
    { ...mallory, userId: alice.userId, displayName: alice.displayName },
  ]);
  const swapped = await verifyAuditChain();
  await db.delete(auditSubjectsTable);
  await db.insert(auditSubjectsTable).values([alice, mallory]);
  const restored = await verifyAuditChain();

  await db.delete(auditContextTable).where(eq(auditContextTable.entryId, aliceEntry.id));
  await db.insert(auditContextTable).values({ ...aliceContext, ip: "203.0.113.7" });
  const forgedContext = await verifyAuditChain();
  await db.delete(auditContextTable).where(eq(auditContextTable.entryId, aliceEntry.id));
  await db.insert(auditContextTable).values(aliceContext);

  const unsigned = await failure(sql`insert into audit_context (entry_id, ip) values (2147483647, '203.0.113.7')`);

  await db.delete(auditContextTable).where(inArray(auditContextTable.entryId, malloryContexts.map((row) => row.entryId)));
  await db.delete(auditSubjectsTable).where(eq(auditSubjectsTable.id, mallory.id));
  const erased = await verifyAuditChain();

  return { subjectIds: [alice.id, mallory.id], aliceEntryId: aliceEntry.id, intact, swapped, restored, forgedContext, unsigned, erased };
});
