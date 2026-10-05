import { randomUUID } from "node:crypto";
import { getRequestHeader } from "h3";
import { desc, eq, sql } from "drizzle-orm";
import { useEvent } from "nitropack/runtime";
import { actorContext } from "../actions/context";
import { auditHash, auditRowMac } from "../audit/chain/hash";
import type { NuxvelTx } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { transaction } from "../database/transaction";
import { personalColumnKeys } from "../privacy/personal-columns";
import { clientIp } from "../security/client-ip";
import { currentRequestId } from "../trpc/context";

const REDACTED_KEYS = new Set(["password", "passwordHash", "token", "secret"]);
const PERSON_TYPE = "user";

function redact(obj: Record<string, unknown> | undefined) {
  if (!obj) return obj;

  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !REDACTED_KEYS.has(key)),
  );
}

function hidePersonalValues(changes: Record<string, unknown> | undefined, targetType: string) {
  if (!changes) return changes;

  const personal = personalColumnKeys(targetType);

  return Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [key, personal.has(key) ? { changed: true } : value]),
  );
}

async function subjectOf(tx: NuxvelTx, userId: string) {
  const auditSubjects = schemaTable("audit_subjects");
  const user = schemaTable("user");
  const [existing] = await tx
    .select({ id: auditSubjects.id })
    .from(auditSubjects)
    .where(eq(auditSubjects.userId, userId));

  if (existing) return existing.id;

  const [person] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const id = randomUUID();

  const displayName = person?.name ?? null;

  await tx
    .insert(auditSubjects)
    .values({ id, userId, displayName, mac: auditRowMac(["audit_subjects", id, userId, displayName]) });

  return id;
}

function requestContext() {
  try {
    const event = useEvent();

    return { ip: clientIp(event) ?? null, userAgent: getRequestHeader(event, "user-agent") ?? null };
  } catch {
    return undefined;
  }
}

/**
 * Writes an audit-log row attributed to the actor in scope, tagged with
 * the current request id.
 *
 * Auto-imported on the server. Throws if called outside an action, since
 * an audit row with no actor is worthless. `password`, `passwordHash`,
 * `token` and `secret` are stripped from `changes` and `metadata`.
 *
 * A user actor, and a target whose type is `"user"`, are stored as a
 * random subject ID from `audit_subjects`, which maps it to the user ID
 * and name. The IP and user agent of the request go to `audit_context`.
 * Each row of both tables carries an HMAC of its content keyed by the
 * chain secret, which {@link verifyAuditChain} checks. They stay outside
 * the chain, so erasing a user's subject keeps the chain valid. When `targetType` is a table name, a key of `changes`
 * that is a column declared `personal` in {@link defineUserData} is
 * stored as `{ changed: true }`, without its values.
 *
 * Each row is chained to the one before it: it stores that row's hash and
 * an HMAC-SHA256 of its own content keyed by `NUXT_AUDIT_CHAIN_SECRET`
 * (outside production, `NUXT_AUTH_SECRET` when it is unset), which
 * {@link verifyAuditChain} re-checks. Throws in production when
 * `NUXT_AUDIT_CHAIN_SECRET` is not set. `audit_log` is append-only: a
 * trigger rejects every UPDATE and DELETE.
 * Writing takes a transaction-scoped lock to keep the chain in order, so
 * concurrent audited transactions commit one at a time.
 *
 * @param action Dotted action name.
 * @param target The row acted on: its `id` becomes `targetId`, and
 * `type`, when given, `targetType` — otherwise the action's first
 * segment (`"post.publish"` → `"post"`) does.
 *
 * @example
 * ```ts
 * await audit("post.publish", { id: post.id }, { metadata: { source: "editor" } });
 * await audit("moderation.hidden", { type: "posts", id: post.id });
 * ```
 */
export async function audit(
  action: string,
  target: { id: unknown; type?: string },
  opts?: {
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
) {
  const actor = actorContext.getStore();

  if (!actor) throw new Error("audit: no actor in context");

  const targetType = target.type ?? action.split(".")[0] ?? action;
  const context = requestContext();
  const auditLog = schemaTable("audit_log");
  const auditContext = schemaTable("audit_context");

  await transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('nuxvel.audit_log'))`);

    const content = {
      actorType: actor.type,
      actorId: actor.type === PERSON_TYPE ? await subjectOf(tx, actor.id) : actor.id,
      action,
      targetType,
      targetId: targetType === PERSON_TYPE ? await subjectOf(tx, String(target.id)) : String(target.id),
      changes: hidePersonalValues(redact(opts?.changes), targetType),
      metadata: redact(opts?.metadata),
      requestId: currentRequestId() ?? null,
    };

    const [clock] = await tx.execute<{ now: string }>(
      sql`select to_json(clock_timestamp()) as now`,
    );
    const entry = { ...content, occurredAt: clock ? new Date(clock.now) : new Date() };

    const [previous] = await tx
      .select({ hash: auditLog.hash })
      .from(auditLog)
      .orderBy(desc(auditLog.id))
      .limit(1);
    const prevHash = previous?.hash ?? null;

    const [inserted] = await tx
      .insert(auditLog)
      .values({ ...entry, prevHash, hash: auditHash(entry, prevHash) })
      .returning({ id: auditLog.id });

    if (inserted && context) {
      await tx.insert(auditContext).values({
        entryId: inserted.id,
        ...context,
        mac: auditRowMac(["audit_context", inserted.id, context.ip, context.userAgent]),
      });
    }
  });
}
