import { randomUUID } from "node:crypto";
import { appendFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@nuxvel/nuxt/testing";
import { run } from "@nuxvel/test-helpers/run";
import { TEST_ADMIN_DATABASE_URL } from "@nuxvel/test-helpers/services";
import postgres from "postgres";
import { afterAll, beforeAll, describe, it } from "vitest";
import { playgroundBuild } from "./helpers/playground";

const admin = postgres(TEST_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });
const name = `nuxvel_release_${randomUUID().replaceAll("-", "_")}`;
const ownerUrl = new URL(TEST_ADMIN_DATABASE_URL);
ownerUrl.pathname = `/${name}`;
const runtimeUrl = new URL(ownerUrl);
runtimeUrl.username = name;
runtimeUrl.password = "runtime";

function nextMonthsPartition(monthsAhead: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAhead, 1));

  return `audit_log_y${start.getUTCFullYear()}m${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function runEntry(entry: string, env: Record<string, string>) {
  const file = join(playgroundBuild().outputDir, "server", "nuxvel", `${entry}.mjs`);

  return run("node", [file], process.cwd(), { PATH: process.env.PATH, ...env });
}

beforeAll(() => admin.unsafe(`create database "${name}"`));

afterAll(async () => {
  await admin.unsafe(`drop database if exists "${name}" with (force)`);
  await admin.unsafe(`drop role if exists "${name}"`);
  await admin.end();
});

describe("the built release entries", () => {
  it("migrate.mjs migrates a fresh database as the owner role", async () => {
    const migrated = await runEntry("migrate", { NUXT_DATABASE_OWNER_URL: ownerUrl.toString() });
    expect(migrated.exitCode, migrated.output).toBe(0);
    expect(migrated.stdout).toContain("nuxvel migrate: the database is up to date");

    const sql = postgres(ownerUrl.toString(), { max: 1 });
    try {
      expect(await sql`select count(*)::int as count from "user"`).toEqual([{ count: 0 }]);
    } finally {
      await sql.end();
    }

    const again = await runEntry("migrate", { NUXT_DATABASE_OWNER_URL: ownerUrl.toString() });
    expect(again.exitCode, again.output).toBe(0);
  });

  it("migrate.mjs applies only the contract migrations NUXVEL_CONTRACT_MIGRATIONS names, and writes what it did to NUXVEL_MIGRATE_RESULT", async () => {
    const serverDir = join(playgroundBuild().outputDir, "..", `contract-${randomUUID()}`, "server");
    const resultFile = join(serverDir, "..", "result.json");
    const contractDir = join(serverDir, "nuxvel", "migrations", "contract");
    const migrate = async (contract: string) => {
      const migrated = await run("node", [join(serverDir, "nuxvel", "migrate.mjs")], process.cwd(), {
        PATH: process.env.PATH,
        NUXT_DATABASE_OWNER_URL: ownerUrl.toString(),
        NUXVEL_CONTRACT_MIGRATIONS: contract,
        NUXVEL_MIGRATE_RESULT: resultFile,
      });
      expect(migrated.exitCode, migrated.output).toBe(0);
      return { stdout: migrated.stdout, result: JSON.parse(readFileSync(resultFile, "utf8")) };
    };

    cpSync(join(playgroundBuild().outputDir, "server"), serverDir, { recursive: true });
    rmSync(contractDir, { recursive: true, force: true });
    mkdirSync(contractDir, { recursive: true });
    writeFileSync(join(contractDir, "0025_user-foreign-key-indexes.sql"), "COMMENT ON TABLE \"posts\" IS 'contracted';\n");

    try {
      const deferred = await migrate("");
      expect(deferred.result).toEqual({ applied: [], contract: [], deferred: ["0025_user-foreign-key-indexes"] });
      expect(deferred.stdout).toContain("nuxvel migrate: deferred the contract migration 0025_user-foreign-key-indexes");

      const applied = await migrate("0025_user-foreign-key-indexes,0099_elsewhere");
      expect(applied.result).toEqual({ applied: [], contract: ["0025_user-foreign-key-indexes"], deferred: [] });
      expect(applied.stdout).toContain("nuxvel migrate: applied the contract migration 0025_user-foreign-key-indexes");

      const sql = postgres(ownerUrl.toString(), { max: 1 });
      try {
        expect(await sql`select obj_description('posts'::regclass) as comment`).toEqual([{ comment: "contracted" }]);
      } finally {
        await sql.end();
      }
    } finally {
      rmSync(join(serverDir, ".."), { recursive: true, force: true });
    }
  });

  it("migrate.mjs refuses to migrate when a migration that ran was edited", async () => {
    const serverDir = join(playgroundBuild().outputDir, "..", `edited-${randomUUID()}`, "server");
    const migrationsDir = join(serverDir, "nuxvel", "migrations");

    cpSync(join(playgroundBuild().outputDir, "server"), serverDir, { recursive: true });

    const first = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()[0];
    if (!first) throw new Error("The build has no migration");
    appendFileSync(join(migrationsDir, first), "\n-- edited");

    try {
      const migrated = await run("node", [join(serverDir, "nuxvel", "migrate.mjs")], process.cwd(), {
        PATH: process.env.PATH,
        NUXT_DATABASE_OWNER_URL: ownerUrl.toString(),
      });

      expect(migrated.exitCode).toBe(1);
      expect(migrated.stderr).toContain(`${first.replace(/\.sql$/, "")} changed after it ran on this database`);
    } finally {
      rmSync(join(serverDir, ".."), { recursive: true, force: true });
    }
  });

  it("maintenance.mjs creates the audit partitions as the owner role, which the runtime role cannot", async () => {
    const partition = nextMonthsPartition(3);
    const owner = postgres(ownerUrl.toString(), { max: 1, onnotice: () => {} });
    const runtime = postgres(runtimeUrl.toString(), { max: 1, onnotice: () => {} });

    try {
      await owner.unsafe(`create role "${name}" login password 'runtime'`);
      await owner.unsafe(`grant select, insert, update, delete on all tables in schema public to "${name}"`);
      await owner.unsafe(`drop table "${partition}"`);

      await expect(runtime.unsafe(`create table "${partition}" (id integer)`)).rejects.toThrow(/permission denied for schema public/);

      const maintained = await runEntry("maintenance", { NUXT_DATABASE_OWNER_URL: ownerUrl.toString() });
      expect(maintained.exitCode, maintained.output).toBe(0);
      expect(maintained.stdout).toContain(`created ${partition}`);

      const [row] = await runtime`select to_regclass(${partition}) is not null as present`;
      expect(row?.present).toBe(true);
    } finally {
      await runtime.end();
      await owner.end();
    }
  });

  it("migrate.mjs exits 1 without a database URL", async () => {
    const migrated = await runEntry("migrate", {});

    expect(migrated.exitCode).toBe(1);
    expect(migrated.stderr).toContain("set NUXT_DATABASE_OWNER_URL");
  });
});
