import { type InferSelectModel, sql } from "drizzle-orm";
import type { SchemaTable } from "../runtime/server/database/schema-table";
import { appSchemaTable } from "./app-schema";
import { testDatabase } from "./database";
import { expectNoRow, expectRow } from "./expect-row";

/** An `audit_log` row, as {@link expectAudited} returns it. */
export type AuditRow = InferSelectModel<SchemaTable<"audit_log">>;

async function subjectOrId(id: string | undefined) {
  if (id === undefined) return undefined;

  const [subject] = await testDatabase().execute<{ id: string }>(
    sql`select id from audit_subjects where user_id = ${id}`,
  );

  return subject?.id ?? id;
}

/**
 * Asserts the app wrote an `audit_log` row for `action` whose columns
 * include `match`, and returns it — the test-side counterpart of the
 * server's {@link audit} and {@link audited}.
 *
 * Reads the `audit_log` table from the app's `server/database/schema/`.
 * `audit()` stores a user as a subject ID; pass the user's ID as `actorId` or `targetId`
 * and it matches that user's subject.
 *
 * @example
 * ```ts
 * const row = await expectAudited("post.updated", { targetId: String(post.id) });
 * expect(row.changes).toEqual({ title: { from: "Draft", to: "Updated" } });
 * ```
 */
export async function expectAudited(
  action: string,
  match: Partial<Omit<AuditRow, "action">> = {},
): Promise<AuditRow> {
  const table = await appSchemaTable("audit_log");

  const actorId = await subjectOrId(match.actorId);
  const targetId = await subjectOrId(match.targetId);

  return expectRow(table, {
    action,
    ...match,
    ...(actorId === undefined ? {} : { actorId }),
    ...(targetId === undefined ? {} : { targetId }),
  });
}

/**
 * Asserts the app wrote no `audit_log` row for `action` whose columns
 * include `match`. The opposite of {@link expectAudited}, with the same
 * matching rules.
 *
 * @example
 * ```ts
 * await expectNotAudited("post.deleted", { targetId: String(post.id) });
 * ```
 */
export async function expectNotAudited(
  action: string,
  match: Partial<Omit<AuditRow, "action">> = {},
): Promise<void> {
  const table = await appSchemaTable("audit_log");

  const actorId = await subjectOrId(match.actorId);
  const targetId = await subjectOrId(match.targetId);

  await expectNoRow(table, {
    action,
    ...match,
    ...(actorId === undefined ? {} : { actorId }),
    ...(targetId === undefined ? {} : { targetId }),
  });
}
