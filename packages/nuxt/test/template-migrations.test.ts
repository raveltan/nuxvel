import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { runMigrations } from "../src/migrations";
import { TEST_ADMIN_DATABASE_URL } from "@nuxvel/test-helpers/services";
import { workerDatabaseName, workerDatabaseUrl } from "./setup/worker";

describe("template DB migrations", () => {
  const sql = postgres(workerDatabaseUrl(), { max: 1 });

  it("health_checks already exists on a fresh worker clone", async () => {
    await sql`insert into health_checks default values`;
    const rows = await sql`select * from health_checks`;
    expect(rows).toHaveLength(1);
  });

  it("is truncated by the afterEach hook from the previous test", async () => {
    const rows = await sql`select * from health_checks`;
    expect(rows).toHaveLength(0);
  });

  describe("a contract migration that requires a backfill", () => {
    function writeFolder(tags: string[]) {
      const folder = mkdtempSync(join(tmpdir(), "nuxvel-migrations-"));
      mkdirSync(join(folder, "meta"));
      mkdirSync(join(folder, "contract"));
      writeFileSync(
        join(folder, "meta", "_journal.json"),
        JSON.stringify({ entries: tags.map((tag, index) => ({ tag, when: 1000 + index })) }),
      );
      return folder;
    }

    function write(folder: string, tag: string, expand: string, contract: string) {
      writeFileSync(join(folder, `${tag}.sql`), expand);
      writeFileSync(join(folder, "contract", `${tag}.sql`), `-- nuxvel:requires-backfill=copy-labels\n${contract}`);
    }

    async function scratch(name: string) {
      const admin = postgres(TEST_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.unsafe(`create database ${name}`);
      await admin.end();
      const url = new URL(TEST_ADMIN_DATABASE_URL);
      url.pathname = `/${name}`;
      return postgres(url.toString(), { max: 1, onnotice: () => {} });
    }

    it("runs at once on a database with no applied migration", async () => {
      const folder = writeFolder(["0000_widgets"]);
      write(folder, "0000_widgets", 'create table "widgets" ("label" text not null);', 'alter table "widgets" drop column "label";');
      const db = await scratch(`${workerDatabaseName()}_g29_fresh`);

      const result = await runMigrations(db, { migrationsFolder: folder, contract: true });

      expect(result.contract).toEqual(["0000_widgets"]);
      expect(result.deferred).toEqual([]);
      await db.end();
    });

    it("still waits for the backfill on a database with applied migrations", async () => {
      const folder = writeFolder(["0000_widgets"]);
      write(folder, "0000_widgets", 'create table "widgets" ("label" text not null);', "select 1;");
      const db = await scratch(`${workerDatabaseName()}_g29_live`);
      await runMigrations(db, { migrationsFolder: folder, contract: true });
      await db.unsafe("insert into widgets (label) values ('a')");
      const next = writeFolder(["0000_widgets", "0001_title"]);
      write(next, "0000_widgets", 'create table "widgets" ("label" text not null);', "select 1;");
      write(next, "0001_title", 'alter table "widgets" add column "title" text;', 'alter table "widgets" drop column "label";');

      const result = await runMigrations(db, { migrationsFolder: next, contract: true });

      expect(result.deferred).toEqual(["0001_title"]);
      await db.end();
    });
  });
});
