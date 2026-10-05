import postgres from "postgres";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { restrictAuditReads } from "../src/runtime/release/restrict-audit-reads";

const ROLE = `audit_runtime_${process.env.VITEST_POOL_ID ?? "0"}`;
const LOGIN = `${ROLE}_login`;
const PARTITION = "audit_log_y2099m01";

function runtimeUrl() {
  const url = new URL(process.env.NUXT_DATABASE_URL ?? "");
  url.username = LOGIN;
  url.password = LOGIN;
  return url.toString();
}

describe("audit read restriction for a login role in the runtime role, as after nuxvel key:rotate", () => {
  const owner = postgres(process.env.NUXT_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  const runtime = postgres(runtimeUrl(), { max: 1, onnotice: () => {} });

  beforeAll(async () => {
    await owner.unsafe(`drop role if exists ${LOGIN}`);
    await owner.unsafe(`drop role if exists ${ROLE}`);
    await owner.unsafe(`create role ${ROLE}`);
    await owner.unsafe(`create role ${LOGIN} login password '${LOGIN}' in role ${ROLE}`);
    await owner.unsafe(`create table ${PARTITION} partition of audit_log for values from ('2099-01-01') to ('2099-02-01')`);
    await owner.unsafe(`grant usage on schema public to ${ROLE}`);
    await owner.unsafe(`grant select, insert, update, delete on all tables in schema public to ${ROLE}`);
    await owner.unsafe(`grant usage, select, update on all sequences in schema public to ${ROLE}`);
    await restrictAuditReads(owner, runtimeUrl());
    await restrictAuditReads(owner, runtimeUrl());
  });

  afterAll(async () => {
    await runtime.end();
    await owner.unsafe(`drop role if exists ${LOGIN}`);
    await owner.unsafe(`drop table ${PARTITION}`);
    await owner.unsafe(`drop owned by ${ROLE}`);
    await owner.unsafe(`drop role ${ROLE}`);
    await owner.end();
  });

  it.for([
    "select * from audit_log",
    "select changes from audit_log",
    `select * from ${PARTITION}`,
    "select display_name from audit_subjects",
    "select ip from audit_context",
  ])("refuses %s to the runtime role", async (query) => {
    await expect(runtime.unsafe(query)).rejects.toMatchObject({ code: "42501" });
  });

  it("lets the runtime role write an audit row and erase its subject the way audit() and eraseUserData() do", async () => {
    const subject = await runtime.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('nuxvel.audit_log'))`;
      await tx`select id from audit_subjects where user_id = 'u_restricted'`;
      await tx`insert into audit_subjects (id, user_id, display_name, mac) values ('s_restricted', 'u_restricted', 'Ada', 'm')`;
      await tx`select hash from audit_log order by id desc limit 1`;
      const [entry] = await tx<{ id: number }[]>`
        insert into audit_log (actor_type, actor_id, action, target_type, target_id, hash)
        values ('user', 's_restricted', 'post.created', 'post', '1', 'h') returning id
      `;
      await tx`insert into audit_context (entry_id, ip, mac) values (${entry?.id ?? 0}, '127.0.0.1', 'm')`;

      const [erased] = await tx<{ id: string }[]>`delete from audit_subjects where user_id = 'u_restricted' returning id`;
      await tx`delete from audit_context where entry_id in (select id from audit_log where actor_id = ${erased?.id ?? ""})`;

      return erased?.id;
    });

    expect(subject).toBe("s_restricted");
    expect(await owner`select ip from audit_context`).toEqual([]);
  });

  it("grants nothing to the login role itself, so the revoke step of a rotation can drop it", async () => {
    await runtime.end();
    await expect(owner.unsafe(`drop role ${LOGIN}`)).resolves.toBeDefined();
  });
});
