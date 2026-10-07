import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CreateBucketCommand, DeleteBucketCommand, GetBucketLifecycleConfigurationCommand, HeadBucketCommand, ListObjectsV2Command, PutBucketLifecycleConfigurationCommand, S3Client } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import { describe, expect, it, onTestFinished } from "vitest";
import { scratchDatabase } from "./helpers/database.ts";
import { runCliWithInput, runCliWithEnv, stripAnsi, tableRows } from "./helpers/run.ts";
import { scratchPlayground, sharedPlayground } from "./helpers/scratch.ts";
import { cliEntry, migrate, startCli } from "@nuxvel/test-helpers/cli";
import { TEST_STORAGE_URL } from "@nuxvel/test-helpers/services";
import { scratchSql } from "@nuxvel/test-helpers/sql";
import { emptyWorkerRedis, waitFor } from "./helpers/services.ts";

const bootEnv = {
  ...process.env,
  NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
  NUXT_AUTH_SECRET: "tinker-test-secret-tinker-test-secret",
};

describe("nuxvel flags, audit, user, backfill and storage commands", () => {
  const playground = sharedPlayground("data");

  it("CI=1 flag:list reports one build step on stderr, a second one with another PATH, COLOR, NODE, session id and AI agent and one after an app/ edit reuse the cached server build, editing a server/ file or a variable the build reads rebuilds it naming the change, and only the last 2 builds not in use are kept", async () => {
    const appDir = scratchPlayground("build-cache");
    const env: NodeJS.ProcessEnv = { ...bootEnv, CI: "1", NUXT_DATABASE_URL: await scratchDatabase("build-cache"), NUXT_REDIS_URL: await emptyWorkerRedis() };
    delete env.AI_AGENT;
    const cacheDir = join(appDir, "node_modules", ".cache", "nuxvel", "server");
    const appBuilds = () =>
      readdirSync(cacheDir).filter((name) => {
        const root = join(cacheDir, name, "root");
        return existsSync(root) && readFileSync(root, "utf8") === appDir;
      });
    const timedFlagsList = async (runEnv: NodeJS.ProcessEnv = env) => {
      const startedAt = performance.now();
      const result = await runCliWithEnv(appDir, runEnv, "flag:list");
      expect(result.exitCode, result.stderr).toBe(0);
      return { ...result, took: performance.now() - startedAt };
    };

    await migrate(appDir, env);

    const first = await timedFlagsList();
    expect(stripAnsi(first.stderr)).toMatch(/^◇ Built the app's server: no earlier build \(\d+(\.\d)?m?s\)\n$/);
    expect(tableRows(first.stdout).header).toEqual(["NAME", "KIND", "DEFAULT", "TARGETING", "STATUS"]);
    expect(tableRows(first.stdout).rows.every((row) => row.length === 5)).toBe(true);
    const [build] = appBuilds();
    expect(build).toBeDefined();
    const builtAt = statSync(join(cacheDir, `${build}`, ".output", "server", "index.mjs")).mtimeMs;

    const second = await timedFlagsList({ ...env, PATH: `${join(appDir, "node_modules", ".bin")}:${process.env.PATH}`, COLOR: "0", NODE: process.execPath, PROBE_SESSION_ID: randomUUID(), AI_AGENT: "probe-agent" });
    expect(second.stdout).toBe(first.stdout);
    expect(stripAnsi(second.stderr)).toMatch(/^◇ Using the server build from .+\n$/);
    expect(second.took).toBeLessThan(first.took);
    expect(appBuilds()).toEqual([build]);
    expect(statSync(join(cacheDir, `${build}`, ".output", "server", "index.mjs")).mtimeMs).toBe(builtAt);

    writeFileSync(join(appDir, "app/pages/cached-build-probe.vue"), "<template><p>probe</p></template>\n");
    writeFileSync(join(appDir, "README.md"), "# edited\n");
    const afterAppEdit = await timedFlagsList();
    expect(afterAppEdit.stderr).toBe(second.stderr);
    expect(appBuilds()).toEqual([build]);

    const tinker = startCli(appDir, ["tinker"], { env, stdin: "pipe" });
    onTestFinished(() => tinker.stop());
    const tinkerExit = new Promise((resolve) => tinker.child.on("exit", resolve));
    await waitFor(async () => existsSync(join(cacheDir, `${build}`, ".users", `${tinker.child.pid}`)) || undefined);

    const probeFlag = join(appDir, "server/flags/cached-build-probe.ts");
    writeFileSync(probeFlag, "export default defineFlag({ default: true });\n");
    const edited = await timedFlagsList();
    expect(stripAnsi(edited.stderr)).toMatch(/^◇ Built the app's server: server\/flags\/cached-build-probe\.ts added \(/);
    expect(tableRows(edited.stdout).rows.find(([name]) => name === "cached-build-probe")?.[2]).toBe("true");

    writeFileSync(probeFlag, "export default defineFlag({ default: false });\n");
    const editedAgain = await timedFlagsList();
    expect(tableRows(editedAgain.stdout).rows.find(([name]) => name === "cached-build-probe")?.[2]).toBe("false");
    expect(appBuilds()).toHaveLength(3);

    tinker.child.stdin?.end('console.log("still running", typeof useDb);\n');
    expect(await tinkerExit).toBe(0);
    expect(tinker.output()).toContain("still running function");

    writeFileSync(probeFlag, 'export default defineFlag({ default: true, expiresAt: "2030-01-01" });\n');
    await timedFlagsList();
    expect(appBuilds()).toHaveLength(2);
    expect(appBuilds()).not.toContain(build);

    const withDevtools = await timedFlagsList({ ...env, NUXVEL_DEVTOOLS: "1" });
    expect(stripAnsi(withDevtools.stderr)).toMatch(/^◇ Built the app's server: env NUXVEL_DEVTOOLS changed \(/);
  }, 300000);

  it("backfill:status reports the rows a partially-run backfill processed and its cursor", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("backfill-status");

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_AUTH_SECRET: "backfill-test-secret-backfill-test-secret",
    };

    await migrate(appDir, env);

    const sql = scratchSql(databaseUrl);
    const rows = await sql<{ id: number }[]>`
      insert into health_checks (name)
      values ('backfill-1'), ('backfill-2'), ('backfill-3-crash'), ('backfill-4'), ('backfill-5')
      returning id
    `;
    const ids = rows.map((row) => row.id);

    const { stdout: tinkerOutput, exitCode: tinkerExitCode } = await runCliWithInput(
      appDir,
      'await runBackfill("_probe-names").catch((error) => console.log("interrupted", error.message));\n',
      env,
      "tinker",
    );

    expect(tinkerExitCode, tinkerOutput).toBe(0);
    expect(tinkerOutput).toContain("interrupted probe backfill crashed");

    const { stdout, stderr, exitCode } = await runCliWithEnv(appDir, env, "backfill:status");

    expect(exitCode, stderr).toBe(0);
    expect(tableRows(stdout)).toEqual({
      header: ["NAME", "ROWS", "CURSOR", "STATE"],
      rows: [["_probe-names", "2/5", String(ids[1]), "in progress"]],
    });

    const json = await runCliWithEnv(appDir, env, "backfill:status", "--json");

    expect(json.exitCode, json.stderr).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({
      backfills: [{ name: "_probe-names", processed: 2, total: 5, cursor: ids[1], completedAt: null }],
    });
  }, 120000);

  it("audit:verify passes an untampered chain, reports the row whose changes were tampered with, and reads as the owner role once db:migrate took the reads from a separate runtime role", async () => {
    const appDir = scratchPlayground("audit-verify");
    const databaseUrl = await scratchDatabase("audit-verify");

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_AUTH_SECRET: "audit-test-secret-audit-test-secret-00",
    };

    await migrate(appDir, env);
    mkdirSync(join(appDir, "server/actions/cli-test"), { recursive: true });
    writeFileSync(
      join(appDir, "server/actions/cli-test/audit-probe.ts"),
      'export const auditProbe = defineAction({ input: postIdInput, handler: ({ id }) => audit(["probe.first", "probe.second", "probe.third"][id - 1], { id }, id === 2 ? { changes: { name: "b" } } : undefined) });\n',
    );

    const { stdout: tinkerOutput, exitCode: tinkerExitCode } = await runCliWithInput(
      appDir,
      [
        'for (const id of [1, 2, 3]) await auditProbe({ id }, { actor: systemActor("cli-test") });',
        "",
      ].join("\n"),
      env,
      "tinker",
    );
    expect(tinkerExitCode, tinkerOutput).toBe(0);

    const intact = await runCliWithEnv(appDir, env, "audit:verify");
    expect(intact.exitCode, intact.stderr).toBe(0);
    expect(stripAnsi(intact.stderr)).toContain("✔ Audit chain intact: 3 rows verified");

    const intactJson = await runCliWithEnv(appDir, env, "audit:verify", "--json");
    expect(intactJson.exitCode, intactJson.stderr).toBe(0);
    expect(JSON.parse(intactJson.stdout)).toEqual({ intact: true, checked: 3, firstBreak: null });

    const sql = scratchSql(databaseUrl);
    const [third] = await sql<{ id: number }[]>`select id from audit_log where action = 'probe.third'`;
    await sql`insert into audit_context (entry_id, ip, mac) values (${third?.id ?? 0}, '203.0.113.7', 'forged')`;

    const forgedContext = await runCliWithEnv(appDir, env, "audit:verify");
    expect(forgedContext.exitCode, forgedContext.stderr).toBe(1);
    expect(stripAnsi(forgedContext.stderr)).toContain(`Audit context of row ${third?.id} was changed`);

    const forgedContextJson = await runCliWithEnv(appDir, env, "audit:verify", "--json");
    expect(JSON.parse(forgedContextJson.stdout)).toEqual({
      intact: false,
      checked: 3,
      firstBreak: { id: third?.id, reason: "context-modified" },
    });

    await sql`delete from audit_context where entry_id = ${third?.id ?? 0}`;

    const [row] = await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      return tx<{ id: number }[]>`update audit_log set changes = '{"name":"forged"}' where action = 'probe.second' returning id`;
    });
    const tamperedId = row?.id;

    const tampered = await runCliWithEnv(appDir, env, "audit:verify");
    expect(tampered.exitCode, tampered.stderr).toBe(1);
    expect(stripAnsi(tampered.stderr)).toContain(
      `✖ Audit chain broken at row ${tamperedId}: its content no longer matches its hash (1 rows verified before it)`,
    );

    const tamperedJson = await runCliWithEnv(appDir, env, "audit:verify", "--json");
    expect(tamperedJson.exitCode, tamperedJson.stderr).toBe(1);
    expect(JSON.parse(tamperedJson.stdout)).toEqual({
      intact: false,
      checked: 1,
      firstBreak: { id: tamperedId, reason: "modified" },
    });

    const runtimeRole = `audit_verify_runtime_${process.env.VITEST_POOL_ID ?? "0"}`;
    const runtimeUrl = new URL(databaseUrl);
    runtimeUrl.username = runtimeRole;
    runtimeUrl.password = runtimeRole;
    const owner = scratchSql(databaseUrl);

    try {
      await owner.unsafe(`drop owned by ${runtimeRole}`).catch(() => {});
      await owner.unsafe(`drop role if exists ${runtimeRole}`);
      await owner.unsafe(`create role ${runtimeRole} login password '${runtimeRole}'`);
      await owner.unsafe(`grant usage on schema public to ${runtimeRole}`);
      await owner.unsafe(`grant select, insert, update, delete on all tables in schema public to ${runtimeRole}`);

      const twoRoles = { ...env, NUXT_DATABASE_URL: runtimeUrl.toString(), NUXT_DATABASE_OWNER_URL: databaseUrl };
      const migrated = await runCliWithEnv(appDir, twoRoles, "db:migrate");
      expect(migrated.exitCode, migrated.stderr).toBe(0);

      const asRuntime = await runCliWithEnv(appDir, { ...twoRoles, NUXT_DATABASE_OWNER_URL: "" }, "audit:verify");
      expect(asRuntime.exitCode).toBe(1);
      expect(stripAnsi(asRuntime.stderr)).toContain("✖ Failed query: select \"id\", \"occurred_at\"");

      const asOwner = await runCliWithEnv(appDir, twoRoles, "audit:verify", "--json");
      expect(asOwner.exitCode, asOwner.stderr).toBe(1);
      expect(JSON.parse(asOwner.stdout)).toMatchObject({ checked: 1, firstBreak: { id: tamperedId, reason: "modified" } });
    } finally {
      await owner.unsafe(`drop owned by ${runtimeRole}`);
      await owner.unsafe(`drop role ${runtimeRole}`);
    }
  }, 180000);

  it("audit:tail streams a newly inserted row, and audit:export over a time range matches a direct query's row count", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("audit-tail-export");

    const env = { ...bootEnv, NUXT_DATABASE_URL: databaseUrl };
    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const hoursIn = (hours: number) => new Date(monthStart + hours * 3600_000).toISOString();
    const insertRow = (sql: ReturnType<typeof scratchSql>, action: string, occurredAt: string, targetId = "1") => sql`
      insert into audit_log (occurred_at, actor_type, actor_id, action, target_type, target_id, changes, hash)
      values (${occurredAt}::timestamptz at time zone 'UTC', 'system', 'cli-test', ${action}, 'probe', ${targetId}, ${sql.json({ note: 'a "quoted", value' })}, 'unchained')
    `;

    const sql = scratchSql(databaseUrl);

    await migrate(appDir, env);

    for (const hours of [1, 2, 3, 4]) await insertRow(sql, `probe.at-${hours}h`, hoursIn(hours), hours === 3 ? "=1+1" : "1");

    const tail = startCli(appDir, ["audit:tail"], { env });
    let tailOutput = "";
    tail.child.stdout?.on("data", (chunk) => (tailOutput += String(chunk)));

    try {
      await tail.waitForOutput("Tailing audit_log");
      await insertRow(sql, "probe.tailed", hoursIn(5));
      await waitFor(async () => (tailOutput.includes("probe.tailed") ? true : undefined));

      const tailLines = tailOutput.trimEnd().split("\n");
      expect(tailLines).toHaveLength(1);
      expect(tailLines[0]).toContain(`${hoursIn(5)}  #5  system:cli-test  probe.tailed  probe:1`);

      const range = { from: hoursIn(1.5), to: hoursIn(3.5) };
      const [direct] = await sql<{ count: number }[]>`
        select count(*)::int as count from audit_log
        where occurred_at >= (${range.from}::timestamptz at time zone 'UTC')
          and occurred_at < (${range.to}::timestamptz at time zone 'UTC')
      `;

      const jsonl = await runCliWithInput(appDir, "", env, "audit:export", "--from", range.from, "--to", range.to);
      expect(jsonl.exitCode, jsonl.output).toBe(0);

      const jsonlRows = jsonl.stdout.trim().split("\n").map((line) => JSON.parse(line));
      expect(jsonlRows).toHaveLength(direct?.count ?? -1);
      expect(jsonlRows.map((row) => row.action)).toEqual(["probe.at-2h", "probe.at-3h"]);
      expect(jsonlRows[0]).toMatchObject({ occurredAt: hoursIn(2), changes: { note: 'a "quoted", value' } });

      const csv = await runCliWithInput(appDir, "", env, "audit:export", "--from", range.from, "--to", range.to, "--format", "csv");
      expect(csv.exitCode, csv.output).toBe(0);

      const csvLines = csv.stdout.trim().split("\n");
      expect(csvLines[0]).toBe("id,occurredAt,actorType,actorId,action,targetType,targetId,changes,metadata,requestId,prevHash,hash");
      expect(csvLines).toHaveLength((direct?.count ?? -1) + 1);
      expect(csvLines[1]).toBe(`2,${hoursIn(2)},system,cli-test,probe.at-2h,probe,1,"{""note"":""a \\""quoted\\"", value""}",,,,unchained`);
      expect(csvLines[2]).toBe(`3,${hoursIn(3)},system,cli-test,probe.at-3h,probe,'=1+1,"{""note"":""a \\""quoted\\"", value""}",,,,unchained`);
    } finally {
      await tail.stop();
    }
  }, 120000);

  it("audit:export of 5 000 rows through a slow reader yields every row", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("audit-export-slow");
    const env = { ...bootEnv, NUXT_DATABASE_URL: databaseUrl };
    const sql = scratchSql(databaseUrl);

    await migrate(appDir, env);
    await sql`
      insert into audit_log (occurred_at, actor_type, actor_id, action, target_type, target_id, hash)
      select now() at time zone 'UTC', 'system', 'cli-test', 'probe.bulk', 'probe', n::text, 'unchained'
      from generate_series(1, 5000) as n
    `;

    const exporter = spawn("node", [cliEntry, "audit:export"], { cwd: appDir, env, stdio: ["ignore", "pipe", "pipe"] });
    const exited = new Promise<number | null>((resolve) => exporter.on("exit", resolve));
    let stderr = "";
    let stdout = "";

    exporter.stderr.on("data", (chunk) => (stderr += String(chunk)));

    for await (const chunk of exporter.stdout) {
      stdout += String(chunk);
      // the reader is slow on purpose: the server must not exit before its pipe drains
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(await exited, stderr).toBe(0);

    const lines = stdout.trim().split("\n");

    expect(lines).toHaveLength(5000);
    expect(JSON.parse(lines.at(-1) ?? "{}")).toMatchObject({ action: "probe.bulk", targetId: "5000" });
  }, 180000);

  it("user:export prints a user's declared rows and user:erase deletes them, leaving an audited erasure", async () => {
    const appDir = scratchPlayground("user-export");
    const databaseUrl = await scratchDatabase("user-data");

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_AUTH_SECRET: "user-data-test-secret-user-data-test",
    };
    const userId = randomUUID();

    await migrate(appDir, env);

    const sql = scratchSql(databaseUrl);

    await sql`insert into "user" (id, name, email) values (${userId}, 'Erasable', 'erasable@example.com')`;
    await sql`insert into posts (title, body, author_id) values ('Mine', 'body', ${userId})`;

    mkdirSync(join(appDir, "server/plugins"), { recursive: true });
    writeFileSync(
      join(appDir, "server/plugins/log-at-boot.ts"),
      'export default defineNitroPlugin(() => useLogger("probe").info("booted for a command"));\n',
    );
    mkdirSync(join(appDir, "server/actions/cli-test"), { recursive: true });
    writeFileSync(
      join(appDir, "server/actions/cli-test/authored-probe.ts"),
      'export const authoredProbe = defineAction({ input: postIdInput, handler: ({ id }) => audit("probe.authored", { id }) });\n',
    );

    const exported = await runCliWithEnv(appDir, env, "user:export", userId);
    expect(exported.exitCode, exported.stderr).toBe(0);
    expect(JSON.parse(exported.stdout)).toMatchObject({
      user: [expect.objectContaining({ email: "erasable@example.com" })],
      posts: [expect.objectContaining({ title: "Mine" })],
      health_checks: [],
      notifications: [],
    });
    expect(stripAnsi(exported.stderr)).toMatch(/INFO\s+probe\s+booted for a command/);

    const authored = await runCliWithInput(
      appDir,
      `await authoredProbe({ id: 1 }, { actor: { type: "user", id: "${userId}" } });\n`,
      env,
      "tinker",
    );
    expect(authored.exitCode, authored.stdout).toBe(0);

    const refused = await runCliWithEnv(appDir, env, "user:erase", userId);
    expect(refused.exitCode).not.toBe(0);
    expect(stripAnsi(refused.stderr)).toContain("Pass --force to run it without asking");

    expect(await sql`select id from "user" where id = ${userId}`).toHaveLength(1);

    const erasureLog = join(appDir, "erasures.log");
    const logCommand = join(appDir, "log-erasure");
    writeFileSync(logCommand, `#!/bin/sh\n[ -n "$FAIL_ERASURE_LOG" ] && { echo "offsite unreachable" >&2; exit 1; }\necho "$1 $2" >> ${erasureLog}\n`);
    chmodSync(logCommand, 0o755);
    const logged = { ...env, NUXT_ERASURE_LOG_COMMAND: `${logCommand} tasks` };

    const unlogged = await runCliWithEnv(appDir, { ...logged, FAIL_ERASURE_LOG: "1" }, "user:erase", userId, "--force");
    expect(unlogged.exitCode).not.toBe(0);
    expect(stripAnsi(unlogged.stderr)).toContain("the erasure log command failed, nothing was erased: offsite unreachable");
    expect(await sql`select id from "user" where id = ${userId}`).toHaveLength(1);

    const erased = await runCliWithEnv(appDir, logged, "user:erase", userId, "--force");
    expect(erased.exitCode, erased.stderr).toBe(0);
    expect(readFileSync(erasureLog, "utf8")).toBe(`tasks ${userId}\n`);
    expect(erased.stdout).toBe("");
    expect(stripAnsi(erased.stderr)).toContain(`✔ Erased user ${userId}: health_checks 0, api_keys 0, notifications 0, posts 1, push_subscriptions 0, user 1`);

    expect(await sql`select id from "user" where id = ${userId}`).toHaveLength(0);
    expect(await sql`select id from posts where author_id = ${userId}`).toHaveLength(0);
    expect(await sql`select action, actor_type from audit_log order by id`).toEqual([
      { action: "probe.authored", actor_type: "user" },
      { action: "user.erased", actor_type: "system" },
    ]);
    expect(await sql`select id from audit_log where actor_id = ${userId} or target_id = ${userId}`).toHaveLength(0);
    expect(await sql`select id from audit_subjects`).toHaveLength(0);

    const verified = await runCliWithEnv(appDir, env, "audit:verify");
    expect(verified.exitCode, verified.stderr).toBe(0);
    expect(stripAnsi(verified.stderr)).toContain("✔ Audit chain intact: 2 rows verified");
  }, 120000);

  it("key:issue prints a new API key once and stores only its hash", async () => {
    const appDir = scratchPlayground("key-issue");
    const databaseUrl = await scratchDatabase("key-issue");
    const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl, NUXT_AUTH_SECRET: "key-issue-test-secret-key-issue-test" };
    const userId = randomUUID();

    await migrate(appDir, env);

    const sql = scratchSql(databaseUrl);

    await sql`insert into "user" (id, name, email) values (${userId}, 'Deployer', 'deployer@example.com')`;

    const issued = await runCliWithEnv(appDir, env, "key:issue", userId, "--name", "ci");
    const key = issued.stdout.trim();

    expect(issued.exitCode, issued.stderr).toBe(0);
    expect(key).toMatch(/^nxk_[\w-]{43}$/);
    expect(stripAnsi(issued.stderr)).toContain(`✔ Issued the API key "ci" for user ${userId}`);
    expect(await sql`select name, key_hash from api_keys where user_id = ${userId}`).toEqual([
      { name: "ci", key_hash: createHash("sha256").update(key).digest("hex") },
    ]);

    const unknown = await runCliWithEnv(appDir, env, "key:issue", "no-such-user", "--name", "ci");

    expect(unknown.exitCode).toBe(1);
    expect(stripAnsi(unknown.stderr)).toContain('no user has the id "no-such-user"');
  }, 120000);

  it("flag:set changes a flag's targeting without a deploy and audit-logs it; flag:list, flag:stale and experiment:start/stop/report work", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("flags");
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "flags-test-secret-flags-test-secret-00",
    };
    const redis = new Redis(redisUrl);
    const sql = scratchSql(databaseUrl);

    try {
      await redis.flushdb();
      await migrate(appDir, env);

      const evaluate = 'console.log(`evaluated ${await flag("probe-rollout", { id: "user-1", role: "beta-tester" })}`);\n';

      const before = await runCliWithInput(appDir, evaluate, env, "tinker");
      expect(before.stdout, before.output).toContain("evaluated false");

      const set = await runCliWithEnv(appDir, env, "flag:set", "probe-rollout", "--role", "beta-tester", "--value", "true");
      expect(set.exitCode, set.stderr).toBe(0);
      expect(set.stdout).toBe("");
      expect(stripAnsi(set.stderr)).toContain("✔ probe-rollout  role beta-tester=true");

      const after = await runCliWithInput(appDir, evaluate, env, "tinker");
      expect(after.stdout, after.output).toContain("evaluated true");

      const targeted = await sql`
        select actor_type, action, target_id, changes from audit_log where action = 'flag.targeted'
      `;

      expect(targeted).toEqual([
        {
          actor_type: "system",
          action: "flag.targeted",
          target_id: "probe-rollout",
          changes: { before: {}, after: { roles: { "beta-tester": true } } },
        },
      ]);

      const list = await runCliWithEnv(appDir, env, "flag:list");
      const listed = tableRows(list.stdout);
      expect(list.exitCode, list.stderr).toBe(0);
      expect(listed.header).toEqual(["NAME", "KIND", "DEFAULT", "TARGETING", "STATUS"]);
      expect(listed.rows).toContainEqual(["probe-rollout", "flag", "false", "role beta-tester=true", "-"]);
      expect(listed.rows).toContainEqual(["probe-cta", "experiment", "-", "control:50 green:50", "not started"]);

      const listJson = await runCliWithEnv(appDir, env, "flag:list", "--json");
      const { flags, experiments } = JSON.parse(listJson.stdout);
      expect(listJson.exitCode, listJson.stderr).toBe(0);
      expect([...flags, ...experiments].map((entry: { name: string }) => entry.name)).toEqual(listed.rows.map((row) => row[0]));
      expect(flags).toContainEqual({
        name: "probe-rollout",
        default: false,
        percentage: null,
        roles: { "beta-tester": true },
        targeting: "role beta-tester=true",
        updatedAt: expect.stringMatching(/^\d{4}-/),
        expiresAt: "2026-01-01",
      });
      expect(experiments).toContainEqual({ name: "probe-cta", variants: { control: 50, green: 50 }, status: "not started" });

      const stale = await runCliWithEnv(appDir, env, "flag:stale");
      expect(stale.exitCode, stale.stderr).toBe(0);
      expect(tableRows(stale.stdout)).toEqual({
        header: ["NAME", "STALE", "SINCE"],
        rows: [["probe-rollout", "expired", "2026-01-01"]],
      });

      const staleJson = await runCliWithEnv(appDir, env, "flag:stale", "--json");
      expect(staleJson.exitCode, staleJson.stderr).toBe(0);
      expect(JSON.parse(staleJson.stdout)).toEqual({ flags: [{ name: "probe-rollout", reason: "expired", since: "2026-01-01" }] });

      const started = await runCliWithEnv(appDir, env, "experiment:start", "probe-cta");
      expect(started.exitCode, started.stderr).toBe(0);
      expect(started.stdout).toBe("");
      expect(stripAnsi(started.stderr)).toContain("✔ probe-cta  running");

      const running = await runCliWithEnv(appDir, env, "flag:list");
      expect(tableRows(running.stdout).rows).toContainEqual(["probe-cta", "experiment", "-", "control:50 green:50", "running"]);

      const stopped = await runCliWithEnv(appDir, env, "experiment:stop", "probe-cta");
      expect(stopped.exitCode, stopped.stderr).toBe(0);
      expect(stopped.stdout).toBe("");

      const experimentRows = await sql`
        select action, target_id from audit_log where action like 'experiment.%' order by id
      `;

      expect(experimentRows).toEqual([
        { action: "experiment.started", target_id: "probe-cta" },
        { action: "experiment.stopped", target_id: "probe-cta" },
      ]);

      for (const [variant, exposed, converted] of [["control", 100, 10], ["green", 100, 25]] as const) {
        for (let index = 0; index < exposed; index += 1) {
          const unitId = `${variant}-${index}`;
          await sql`insert into flag_exposures (name, unit_id, variant) values ('probe-cta', ${unitId}, ${variant})`;
          if (index < converted) {
            await sql`insert into flag_conversions (name, unit_id, metric) values ('probe-cta', ${unitId}, 'probe.converted')`;
          }
        }
      }

      const report = await runCliWithInput(appDir, "", env, "experiment:report", "probe-cta");
      expect(report.exitCode, report.output).toBe(0);
      expect(report.stdout).toContain("probe-cta  sample ratio ok (p=1.00)");
      expect(report.stdout).toContain(
        "control  weight 50  exposures 100  probe.converted 10 (10.0%, 95% CI 5.5%–17.4%)",
      );
      expect(report.stdout).toContain(
        "green  weight 50  exposures 100  probe.converted 25 (25.0%, 95% CI 17.5%–34.3%)",
      );

      const json = await runCliWithEnv(appDir, env, "experiment:report", "probe-cta", "--json");
      expect(json.exitCode, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout)).toMatchObject({
        name: "probe-cta",
        variants: [
          { variant: "control", weight: 50, exposures: 100, metrics: [{ metric: "probe.converted", conversions: 10, rate: 0.1 }] },
          { variant: "green", weight: 50, exposures: 100, metrics: [{ metric: "probe.converted", conversions: 25, rate: 0.25 }] },
        ],
        sampleRatio: { pValue: 1, mismatch: false },
      });

      const unknown = await runCliWithInput(appDir, "", env, "flag:set", "nope", "--percentage", "10");
      expect(unknown.exitCode).toBe(1);
      expect(stripAnsi(unknown.stderr)).toContain('✖ no flag named "nope"');
      expect(stripAnsi(unknown.stderr)).toContain("→ Run nuxvel flag:list to see the flags");

      const outOfRange = await runCliWithInput(appDir, "", env, "flag:set", "probe-rollout", "--percentage", "200");
      expect(outOfRange.exitCode).toBe(2);
      expect(stripAnsi(outOfRange.stderr)).toContain("✖ --percentage must be a number from 0 to 100");
      expect(stripAnsi(outOfRange.stderr)).toContain("→ e.g. --percentage 25");
    } finally {
      await redis.flushdb();
      await redis.quit();
    }
  }, 180000);

  it("flag:stale lists a flag no code references, but not a renamed() alias or a flag used through $flags", async () => {
    const appDir = scratchPlayground("unreferenced-flag");
    const env = {
      ...process.env,
      NUXT_DATABASE_URL: await scratchDatabase("unreferenced-flag"),
      NUXT_REDIS_URL: await emptyWorkerRedis(),
      NUXT_AUTH_SECRET: "unreferenced-flag-secret-unreferenced-00",
    };

    writeFileSync(join(appDir, "server/flags/unused-banner.ts"), "export default defineFlag({ default: false });\n");
    mkdirSync(join(appDir, "server/flags/checkout"), { recursive: true });
    writeFileSync(join(appDir, "server/flags/checkout/one-click.ts"), "export default defineFlag({ default: false });\n");
    writeFileSync(
      join(appDir, "server/utils/checkout-one-click.ts"),
      "export const checkoutOneClick = () => flag($flags.checkout.oneClick);\n",
    );
    mkdirSync(join(appDir, "layers/near-miss"), { recursive: true });
    writeFileSync(join(appDir, "layers/near-miss/banner.ts"), "export const banner = $flags.unusedBannerV2;\n");
    writeFileSync(
      join(appDir, "server/flags/rollout-before-move.ts"),
      'import { probeRolloutFlag } from "./probe-rollout.flag";\n\nexport default renamed(probeRolloutFlag);\n',
    );

    const stale = await runCliWithEnv(appDir, env, "flag:stale", "--json");
    expect(stale.exitCode, stale.stderr).toBe(0);
    expect(JSON.parse(stale.stdout)).toEqual({
      flags: [
        { name: "probe-rollout", reason: "expired", since: "2026-01-01" },
        { name: "unused-banner", reason: "unreferenced", since: null },
      ],
    });

    const table = await runCliWithEnv(appDir, env, "flag:stale");
    expect(tableRows(table.stdout).rows).toContainEqual(["unused-banner", "unreferenced", "-"]);
  }, 120000);

  it("a flag and a backfill moved behind renamed() go on with what is stored under their old names", async () => {
    const appDir = scratchPlayground("renamed-state");
    const databaseUrl = await scratchDatabase("renamed-state");
    const redisUrl = await emptyWorkerRedis();

    writeFileSync(
      join(appDir, "server/flags/rollout-before-move.ts"),
      'import { probeRolloutFlag } from "./probe-rollout.flag";\n\nexport default renamed(probeRolloutFlag);\n',
    );
    writeFileSync(
      join(appDir, "server/database/backfills/_names-before-move.ts"),
      'import names from "./_probe-names";\n\nexport default renamed(names);\n',
    );

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "renamed-test-secret-renamed-test-secret",
    };
    const redis = new Redis(redisUrl);
    const sql = scratchSql(databaseUrl);

    try {
      await redis.flushdb();
      await redis.set("nuxvel:flags:rollout-before-move", JSON.stringify({ percentage: 100 }));
      await migrate(appDir, env);

      const [first] = await sql<{ id: number }[]>`
        insert into health_checks (name) values ('backfill-1'), ('backfill-2') returning id
      `;
      await sql`
        insert into backfills (name, cursor, processed, total)
        values ('_names-before-move', ${sql.json(first?.id ?? 0)}, 1, 2)
      `;

      const tinker = await runCliWithInput(
        appDir,
        'console.log(`evaluated ${await flag("probe-rollout", { id: "user-1" })}`);\nawait runBackfill("_probe-names");\n',
        env,
        "tinker",
      );

      expect(tinker.exitCode, tinker.output).toBe(0);
      expect(tinker.stdout).toContain("evaluated true");

      const set = await runCliWithInput(appDir, "", env, "flag:set", "probe-rollout", "--percentage", "10");

      expect(set.exitCode, set.output).toBe(0);
      expect(JSON.parse((await redis.get("nuxvel:flags:rollout-before-move")) ?? "{}")).toMatchObject({ percentage: 10 });
      expect(await redis.get("nuxvel:flags:probe-rollout")).toBeNull();

      expect((await sql`select name from health_checks order by id`).map((row) => row.name)).toEqual([
        "backfill-1",
        "backfill-2+",
      ]);
      expect(await sql`select name, processed, completed_at is not null as completed from backfills`).toEqual([
        { name: "_names-before-move", processed: 2, completed: true },
      ]);
    } finally {
      redis.disconnect();
    }
  }, 90000);

  it("storage:setup creates the bucket from .env with a lifecycle rule expiring tmp/ uploads", async () => {
    const appDir = scratchPlayground("storage-setup");
    const bucket = `nuxvel-cli-${randomUUID()}`;
    const { NUXT_STORAGE_BUCKET: _bucket, ...shellEnv } = process.env;
    const env = { ...shellEnv, NUXT_STORAGE_URL: TEST_STORAGE_URL };
    writeFileSync(
      join(appDir, ".env"),
      `NUXT_STORAGE_BUCKET=${bucket}\nNUXT_STORAGE_URL=http://wrong:wrong@localhost:1\n`,
    );
    const storageUrl = new URL(TEST_STORAGE_URL);
    const s3 = new S3Client({
      endpoint: storageUrl.origin,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: decodeURIComponent(storageUrl.username),
        secretAccessKey: decodeURIComponent(storageUrl.password),
      },
    });

    try {
      const first = await runCliWithEnv(appDir, env, "storage:setup");

      expect(first.exitCode, first.stderr).toBe(0);
      expect(first.stdout).toBe("");
      expect(stripAnsi(first.stderr)).toBe(
        `✔ Created bucket ${bucket}\n✔ Uploads under ${bucket}/tmp/ expire after 1 day\n`,
      );

      await s3.send(new HeadBucketCommand({ Bucket: bucket }));

      const { Rules } = await s3.send(
        new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
      );

      expect(Rules).toEqual([
        {
          ID: "expire-temp-uploads",
          Status: "Enabled",
          Filter: { Prefix: "tmp/" },
          Expiration: { Days: 1 },
        },
      ]);

      const exportsRule = {
        ID: "expire-exports",
        Status: "Enabled" as const,
        Filter: { Prefix: "exports/" },
        Expiration: { Days: 7 },
      };
      await s3.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucket,
          LifecycleConfiguration: { Rules: [...(Rules ?? []), exportsRule] },
        }),
      );

      const second = await runCliWithEnv(appDir, env, "storage:setup");

      expect(second.exitCode, second.stderr).toBe(0);
      expect(second.stdout).toBe("");
      expect(stripAnsi(second.stderr)).toContain(`✔ Bucket ${bucket} already exists`);

      const after = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));

      expect(after.Rules?.map((rule) => rule.ID).sort()).toEqual(["expire-exports", "expire-temp-uploads"]);
      expect(after.Rules?.find((rule) => rule.ID === "expire-exports")).toMatchObject(exportsRule);
    } finally {
      await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
      s3.destroy();
    }
  }, 60000);

  it("storage:check writes, reads and deletes a file and finds signed lengths enforced", async () => {
    const bucket = `nuxvel-cli-${randomUUID()}`;
    const storageUrl = new URL(TEST_STORAGE_URL);
    const s3 = new S3Client({
      endpoint: storageUrl.origin,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: decodeURIComponent(storageUrl.username),
        secretAccessKey: decodeURIComponent(storageUrl.password),
      },
    });

    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));

      const result = await runCliWithEnv(playground, { ...process.env, NUXT_STORAGE_URL: TEST_STORAGE_URL, NUXT_STORAGE_BUCKET: bucket }, "storage:check");

      expect(result.exitCode, result.stderr).toBe(0);
      expect(stripAnsi(result.stderr)).toBe(
        `✔ Wrote, read and deleted a file in ${bucket}\n✔ ${bucket} refuses an upload longer than its signed Content-Length\n`,
      );

      const { KeyCount } = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));

      expect(KeyCount ?? 0).toBe(0);
    } finally {
      await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
      s3.destroy();
    }
  }, 60000);
});
