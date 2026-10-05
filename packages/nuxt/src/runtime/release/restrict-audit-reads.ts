import type { Sql } from "postgres";

/**
 * Takes read access to the audit tables away from the runtime role, the
 * user of `runtimeUrl`, and from every role it inherits privileges from,
 * over a connection as the owner role. Each of these roles that can
 * insert into `audit_log` keeps only what `audit()` and `eraseUserData()`
 * need: INSERT, SELECT on `audit_log (id, hash, actor_id)`,
 * `audit_subjects (id, user_id)` and `audit_context (entry_id)`, and
 * DELETE on `audit_subjects` and `audit_context`. Every partition of `audit_log`
 * loses all of its privileges, because a partition does not inherit the
 * column grants of `audit_log`.
 *
 * Does nothing when the runtime role is the role of `sql`, when the role
 * does not exist, or when the database has no `audit_log` table.
 *
 * @internal Run by the built `migrate.mjs` and `maintenance.mjs`
 * entries, `nuxvel db:migrate` and `nuxvel dev`.
 */
export async function restrictAuditReads(sql: Sql, runtimeUrl: string | undefined) {
  if (!runtimeUrl) return;

  const runtime = decodeURIComponent(new URL(runtimeUrl).username);
  const [state] = await sql<{ applies: boolean }[]>`
    select to_regclass('audit_log') is not null
      and ${runtime} <> current_user
      and exists (select 1 from pg_roles where rolname = ${runtime}) as applies
  `;

  if (!state?.applies) return;

  const roles = await sql<{ name: string; writes: boolean }[]>`
    select rolname as name, exists (
      select 1 from aclexplode((select relacl from pg_class where oid = 'audit_log'::regclass)) as acl
      where acl.grantee = pg_roles.oid and acl.privilege_type = 'INSERT'
    ) as writes
    from pg_roles
    where pg_has_role(${runtime}, oid, 'USAGE')
      and oid <> (select relowner from pg_class where oid = 'audit_log'::regclass)
      and rolname not like 'pg\\_%'
  `;
  const partitions = await sql<{ name: string }[]>`
    select child.relname as name
    from pg_inherits
    join pg_class parent on parent.oid = pg_inherits.inhparent
    join pg_class child on child.oid = pg_inherits.inhrelid
    where parent.relname = 'audit_log'
  `;
  const tables = ["audit_log", "audit_subjects", "audit_context", ...partitions.map((row) => row.name)];

  await sql.begin(async (tx) => {
    for (const { name, writes } of roles) {
      const role = tx(name);

      for (const table of tables) await tx`revoke all on ${tx(table)} from ${role}`;

      if (!writes) continue;

      await tx`grant insert, select (id, hash, actor_id) on audit_log to ${role}`;
      await tx`grant insert, delete, select (id, user_id) on audit_subjects to ${role}`;
      await tx`grant insert, delete, select (entry_id) on audit_context to ${role}`;
    }
  });
}
