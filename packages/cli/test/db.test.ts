import { cpSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { scratchSql } from "@nuxvel/test-helpers/sql";
import { describe, expect, it } from "vitest";
import { scratchDatabase } from "./helpers/database.ts";
import { runCliAt, runCliWithEnv, stripAnsi } from "./helpers/run.ts";
import { buildNuxtFixture } from "./helpers/fixtures.ts";
import { linkNodeModules, playgroundDir, scratchDir, scratchPlayground } from "./helpers/scratch.ts";
import { emptyWorkerRedis } from "./helpers/services.ts";

type Journal = { entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[] };

function readJournal(appDir: string): Journal {
  return JSON.parse(readFileSync(join(appDir, "server", "database", "migrations", "meta", "_journal.json"), "utf8"));
}

function addMigration(appDir: string, tag: string, statements: string) {
  const migrationsDir = join(appDir, "server", "database", "migrations");
  const journalFile = join(migrationsDir, "meta", "_journal.json");
  const journal = readJournal(appDir);
  const last = journal.entries.at(-1);

  journal.entries.push({ idx: (last?.idx ?? -1) + 1, version: "7", when: (last?.when ?? 0) + 1000, tag, breakpoints: true });
  writeFileSync(journalFile, JSON.stringify(journal, null, 2));
  writeFileSync(join(migrationsDir, `${tag}.sql`), statements);
}

describe("nuxvel db:*", () => {
  it("db:generate produces a new migration file named by its first argument", async () => {
    const fixtureCwd = scratchDir("");

    cpSync(join(playgroundDir, "server", "database", "schema"), join(fixtureCwd, "server", "database", "schema"), {
      recursive: true,
    });
    cpSync(
      join(playgroundDir, "server", "database", "migrations"),
      join(fixtureCwd, "server", "database", "migrations"),
      { recursive: true },
    );
    cpSync(join(playgroundDir, "drizzle.config.ts"), join(fixtureCwd, "drizzle.config.ts"));
    linkNodeModules(fixtureCwd);

    const schemaFile = join(fixtureCwd, "server", "database", "schema", "health-check.schema.ts");
    const schema = readFileSync(schemaFile, "utf-8");
    writeFileSync(
      schemaFile,
      schema.replace('name: text("name").notNull().default(""),', '$&\n  scratchColumn: text("scratch_column"),'),
    );

    const migrationsDir = join(fixtureCwd, "server", "database", "migrations");
    const before = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "db:generate", "scratch_column");

    const after = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));

    expect(exitCode, stdout).toBe(0);
    expect(after.length).toBe(before.length + 1);
    expect(after.filter((name) => !before.includes(name))).toEqual([
      expect.stringMatching(/_scratch_column\.sql$/),
    ]);
  });

  it("db:generate moves the breaking statements of the new migration into migrations/contract/", async () => {
    const fixtureCwd = scratchDir("contract");

    for (const path of [["server", "database", "schema"], ["server", "database", "migrations"], ["drizzle.config.ts"]]) {
      cpSync(join(playgroundDir, ...path), join(fixtureCwd, ...path), { recursive: true });
    }
    linkNodeModules(fixtureCwd);

    const schemaDir = join(fixtureCwd, "server", "database", "schema");
    const editSchema = (file: string, from: string, to: string) =>
      writeFileSync(join(schemaDir, file), readFileSync(join(schemaDir, file), "utf8").replace(from, to));

    editSchema("health-check.schema.ts", 'name: text("name").notNull().default(""),', "");
    editSchema("health-check.schema.ts", '.references(() => userTable.id, { onDelete: "cascade" })', '$&.notNull()');
    editSchema("posts.schema.ts", 'title: text("title").notNull(),', '$&\n    summary: text("summary"),');
    editSchema("posts.schema.ts", '.references(() => userTable.id, { onDelete: "cascade" })', '.references(() => userTable.id, { onDelete: "restrict" })');

    const { stderr, exitCode } = await runCliAt(fixtureCwd, "db:generate", "--name", "contract-split");
    const output = stripAnsi(stderr);
    const migrationsDir = join(fixtureCwd, "server", "database", "migrations");
    const tag = readdirSync(migrationsDir).find((name) => name.endsWith("_contract-split.sql"))?.replace(/\.sql$/, "");

    expect(exitCode, output).toBe(0);
    expect(tag).toBeDefined();
    expect(output).toContain(`▲ Moved 2 breaking statements to contract/${tag}.sql`);
    expect(output).toContain('ALTER TABLE "health_checks" DROP COLUMN "name"');
    expect(output).toContain('ALTER TABLE "health_checks" ALTER COLUMN "user_id" SET NOT NULL');

    const expand = readFileSync(join(migrationsDir, `${tag}.sql`), "utf8");
    const contract = readFileSync(join(migrationsDir, "contract", `${tag}.sql`), "utf8");

    expect(expand).toContain('ALTER TABLE "posts" ADD COLUMN "summary" text;');
    expect(expand).toContain('ALTER TABLE "posts" DROP CONSTRAINT "posts_author_id_user_id_fk";');
    expect(expand).toContain('ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_user_id_fk"');
    expect(contract).toBe(
      'ALTER TABLE "health_checks" ALTER COLUMN "user_id" SET NOT NULL;\n--> statement-breakpoint\nALTER TABLE "health_checks" DROP COLUMN "name";\n',
    );
  });

  it("db:generate moves each index on an existing table into a migration of its own that builds it concurrently", async () => {
    const appDir = scratchPlayground("concurrent-index");
    const schemaFile = join(appDir, "server", "database", "schema", "posts.schema.ts");
    const migrationsDir = join(appDir, "server", "database", "migrations");
    const [expand, title, summary] = [0, 1, 2].map((offset) => String(readJournal(appDir).entries.length + offset).padStart(4, "0"));

    writeFileSync(
      schemaFile,
      readFileSync(schemaFile, "utf8")
        .replace('body: text("body").notNull(),', '$&\n    summary: text("summary"),')
        .replace("searchIndex(table)]", 'searchIndex(table), index("posts_title_idx").on(table.title), index("posts_summary_idx").on(table.summary)]'),
    );

    const generated = await runCliAt(appDir, "db:generate", "--name", "posts-summary");
    const output = stripAnsi(generated.stderr);

    expect(generated.exitCode, output).toBe(0);
    expect(output).toContain(`▲ Moved 2 indexes on existing tables to ${title}_posts-summary-index, ${summary}_posts-summary-index-2`);
    expect(readFileSync(join(migrationsDir, `${expand}_posts-summary.sql`), "utf8")).toBe('ALTER TABLE "posts" ADD COLUMN "summary" text;\n');
    expect(readFileSync(join(migrationsDir, `${title}_posts-summary-index.sql`), "utf8")).toBe(
      '-- nuxvel:no-transaction\nCREATE INDEX CONCURRENTLY "posts_title_idx" ON "posts" USING btree ("title");\n',
    );
    expect(readFileSync(join(migrationsDir, `${summary}_posts-summary-index-2.sql`), "utf8")).toBe(
      '-- nuxvel:no-transaction\nCREATE INDEX CONCURRENTLY "posts_summary_idx" ON "posts" USING btree ("summary");\n',
    );

    const checked = await runCliAt(appDir, "db:check");
    expect(checked.exitCode, stripAnsi(checked.stderr)).toBe(0);

    const again = await runCliAt(appDir, "db:generate", "--name", "nothing");
    expect(again.exitCode, again.stderr).toBe(0);
    expect(again.stdout).toContain("No schema changes");
  });

  it("db:generate loads a schema that imports timestamps() from @nuxvel/nuxt/database, outside Nuxt", async () => {
    const fixtureCwd = scratchDir("public-timestamps");

    mkdirSync(join(fixtureCwd, "server", "database", "schema"), { recursive: true });
    cpSync(join(playgroundDir, "drizzle.config.ts"), join(fixtureCwd, "drizzle.config.ts"));
    linkNodeModules(fixtureCwd);
    writeFileSync(
      join(fixtureCwd, "server", "database", "schema", "gadgets.ts"),
      [
        'import { pgTable, serial } from "drizzle-orm/pg-core";',
        'import { timestamps } from "@nuxvel/nuxt/database";',
        "",
        'export const gadgets = pgTable("gadgets", {',
        '  id: serial("id").primaryKey(),',
        "  ...timestamps(),",
        "});",
        "",
      ].join("\n"),
    );

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "db:generate");
    expect(exitCode, stdout).toBe(0);

    const migrationsDir = join(fixtureCwd, "server", "database", "migrations");
    const migrationFile = readdirSync(migrationsDir).find((name) => name.endsWith(".sql"));
    const migrationSql = readFileSync(join(migrationsDir, migrationFile as string), "utf-8");

    expect(migrationSql).toContain('CREATE TABLE "gadgets"');
    expect(migrationSql).toContain('"created_at" timestamp DEFAULT now() NOT NULL');
    expect(migrationSql).toContain('"updated_at" timestamp DEFAULT now() NOT NULL');
  });

  it("db:generate sees a table in server/domains/<domain>/schema/ through the schema glob of drizzle.config.ts", async () => {
    const fixtureCwd = scratchDir("domain-schema");

    mkdirSync(join(fixtureCwd, "server", "domains", "order", "schema"), { recursive: true });
    cpSync(join(playgroundDir, "drizzle.config.ts"), join(fixtureCwd, "drizzle.config.ts"));
    linkNodeModules(fixtureCwd);
    writeFileSync(
      join(fixtureCwd, "server", "domains", "order", "schema", "shipments.schema.ts"),
      [
        'import { pgTable, serial } from "drizzle-orm/pg-core";',
        "",
        'export const shipmentsTable = pgTable("shipments", {',
        '  id: serial("id").primaryKey(),',
        "});",
        "",
      ].join("\n"),
    );

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "db:generate");
    expect(exitCode, stdout).toBe(0);

    const migrationsDir = join(fixtureCwd, "server", "database", "migrations");
    const migrationFile = readdirSync(migrationsDir).find((name) => name.endsWith(".sql"));

    expect(readFileSync(join(migrationsDir, migrationFile as string), "utf-8")).toContain('CREATE TABLE "shipments"');
  });

  it("db:generate sees the tables of each module in layers/ through the schema globs of drizzle.config.ts", async () => {
    const fixtureCwd = scratchDir("layer-schema");
    const moduleDir = join(fixtureCwd, "layers", "billing", "server");

    mkdirSync(join(moduleDir, "database", "schema"), { recursive: true });
    mkdirSync(join(moduleDir, "domains", "refund", "schema"), { recursive: true });
    cpSync(join(playgroundDir, "drizzle.config.ts"), join(fixtureCwd, "drizzle.config.ts"));
    linkNodeModules(fixtureCwd);
    writeFileSync(
      join(moduleDir, "database", "schema", "invoices.schema.ts"),
      'import { pgTable, serial } from "drizzle-orm/pg-core";\n\nexport const invoicesTable = pgTable("invoices", { id: serial("id").primaryKey() });\n',
    );
    writeFileSync(
      join(moduleDir, "domains", "refund", "schema", "refunds.schema.ts"),
      'import { pgTable, serial } from "drizzle-orm/pg-core";\n\nexport const refundsTable = pgTable("refunds", { id: serial("id").primaryKey() });\n',
    );

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "db:generate");
    expect(exitCode, stdout).toBe(0);

    const migrationsDir = join(fixtureCwd, "server", "database", "migrations");
    const migrationFile = readdirSync(migrationsDir).find((name) => name.endsWith(".sql"));
    const migrationSql = readFileSync(join(migrationsDir, migrationFile as string), "utf-8");

    expect(migrationSql).toContain('CREATE TABLE "invoices"');
    expect(migrationSql).toContain('CREATE TABLE "refunds"');
  });

  it("db:studio runs drizzle-kit studio on the app's config with NUXT_DATABASE_URL, passing extra arguments", async () => {
    const appDir = scratchDir("db-studio");
    const fakeKit = join(appDir, "node_modules", "drizzle-kit");

    cpSync(join(playgroundDir, "drizzle.config.ts"), join(appDir, "drizzle.config.ts"));
    mkdirSync(fakeKit, { recursive: true });
    writeFileSync(join(fakeKit, "package.json"), JSON.stringify({ name: "drizzle-kit", bin: { "drizzle-kit": "bin.cjs" } }));
    writeFileSync(
      join(fakeKit, "bin.cjs"),
      [
        'const { readFileSync } = require("node:fs");',
        "const args = process.argv.slice(2);",
        'const config = readFileSync(args[args.indexOf("--config") + 1], "utf8");',
        "console.log(JSON.stringify({ args, config, url: process.env.NUXT_DATABASE_URL }));",
      ].join("\n"),
    );
    writeFileSync(join(appDir, ".env"), "NUXT_DATABASE_URL=postgres://studio@localhost:5432/app\n");

    const { NUXT_DATABASE_URL: _url, ...env } = process.env;
    const studio = await runCliWithEnv(appDir, env, "db:studio", "--port", "5000");
    const seen: { args: string[]; config: string; url: string } = JSON.parse(studio.stdout);

    expect(studio.exitCode, studio.stderr).toBe(0);
    expect(seen.args).toEqual(["studio", "--config", expect.stringMatching(/drizzle\.config\.ts$/), "--port", "5000"]);
    expect(seen.config).toContain(`import config from ${JSON.stringify(join(appDir, "drizzle.config.ts"))};`);
    expect(seen.config).toContain("dbCredentials: { url: process.env.NUXT_DATABASE_URL }, ...config");
    expect(seen.url).toBe("postgres://studio@localhost:5432/app");
  });

  it("db:check fails on a foreign key without an index, unless nuxvel.database.unindexedForeignKeys gives a reason", async () => {
    const appDir = scratchDir("db-check");
    const writeExceptions = (exceptions: Record<string, string>) =>
      writeFileSync(
        join(appDir, "nuxt.config.ts"),
        `export default { nuxvel: { database: { unindexedForeignKeys: ${JSON.stringify(exceptions)} } } };\n`,
      );

    linkNodeModules(appDir);
    mkdirSync(join(appDir, "server", "database", "schema"), { recursive: true });
    writeFileSync(
      join(appDir, "server", "database", "schema", "posts.ts"),
      [
        'import { index, integer, pgTable, serial } from "drizzle-orm/pg-core";',
        "",
        'export const authors = pgTable("authors", { id: serial("id").primaryKey() });',
        "",
        "export const posts = pgTable(",
        '  "posts",',
        "  {",
        '    id: serial("id").primaryKey(),',
        '    authorId: integer("author_id").notNull().references(() => authors.id),',
        '    editorId: integer("editor_id").references(() => authors.id),',
        '    reviewerId: integer("reviewer_id").references(() => authors.id),',
        "  },",
        '  (table) => [index("posts_author_id_idx").on(table.authorId)],',
        ");",
        "",
      ].join("\n"),
    );

    writeExceptions({ "posts.editor_id": "Editors are never deleted", "posts.reviewer_id": " " });
    const failed = await runCliAt(appDir, "db:check");
    const output = stripAnsi(failed.stderr);

    expect(failed.exitCode, output).toBe(1);
    expect(output).toContain("✖ Foreign key posts.reviewer_id has no index that starts with its columns");
    expect(output).not.toContain("posts.editor_id");
    expect(output).not.toContain("posts.author_id");
    expect(output).toContain("✖ 1 foreign key without an index");
    expect(output).toContain(
      "→ Add an index on the columns in the table's schema file, or list the key in nuxvel.database.unindexedForeignKeys with a reason",
    );

    writeExceptions({ "posts.editor_id": "Editors are never deleted", "posts.reviewer_id": "Reviews are rare" });
    const passed = await runCliAt(appDir, "db:check");

    expect(passed.exitCode, passed.stderr).toBe(0);
    expect(stripAnsi(passed.stderr)).toContain("✔ Every foreign key has an index");
  });

  it("db:check fails on breaking statements and blocking indexes in the migrations after the baseline", async () => {
    const appDir = scratchPlayground("db-check-migrations");
    const baselineFile = join(appDir, "server", "database", "migrations", "meta", "_nuxvel.json");
    const check = async (...args: string[]) => {
      const { exitCode, stderr } = await runCliAt(appDir, "db:check", ...args);
      return { exitCode, output: stripAnsi(stderr) };
    };

    const baselined = await check();
    expect(baselined.exitCode, baselined.output).toBe(0);
    expect(baselined.output).toContain("✔ Every migration is safe to deploy");

    rmSync(baselineFile);
    const unbaselined = await check();
    expect(unbaselined.exitCode, unbaselined.output).toBe(1);
    expect(unbaselined.output).toContain("0025_user-foreign-key-indexes:\n✖ CREATE INDEX blocks the writes to account while it builds");
    expect(unbaselined.output).toContain("→ Fix each one, or run nuxvel db:check --baseline");

    const latest = readJournal(appDir).entries.at(-1)?.tag;
    const accepted = await check("--baseline");
    expect(accepted.exitCode, accepted.output).toBe(0);
    expect(accepted.output).toContain(`✔ Baseline set at ${latest}`);
    expect(JSON.parse(readFileSync(baselineFile, "utf8"))).toEqual({ baseline: latest });

    addMigration(
      appDir,
      "0100_widgets",
      [
        'CREATE TABLE "widgets" ("id" serial PRIMARY KEY, "name" text);',
        'CREATE INDEX "widgets_name_idx" ON "widgets" USING btree ("name");',
        'CREATE INDEX "posts_title_idx" ON "posts" USING btree ("title");',
        'ALTER TABLE "posts" DROP COLUMN "body";',
        'CREATE INDEX CONCURRENTLY "posts_body_idx" ON "posts" ("body");',
        'ALTER TABLE "posts" DROP CONSTRAINT "posts_author_id_user_id_fk";',
        'ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict;',
      ].join("\n--> statement-breakpoint\n"),
    );
    addMigration(
      appDir,
      "0101_posts-author-index",
      '-- nuxvel:no-transaction\nCREATE INDEX CONCURRENTLY "posts_author_idx" ON "public"."posts" ("author_id");',
    );
    addMigration(
      appDir,
      "0102_posts-two-indexes",
      [
        '-- nuxvel:no-transaction\nCREATE INDEX CONCURRENTLY "posts_created_idx" ON "posts" ("created_at");',
        'CREATE INDEX CONCURRENTLY "posts_updated_idx" ON "posts" ("updated_at");',
      ].join("\n--> statement-breakpoint\n"),
    );

    const unsafe = await check();
    expect(unsafe.exitCode, unsafe.output).toBe(1);
    expect(unsafe.output).toContain(
      '0100_widgets:\n✖ CREATE INDEX blocks the writes to posts while it builds: CREATE INDEX "posts_title_idx" ON "posts" USING btree ("title")',
    );
    expect(unsafe.output).toContain('0100_widgets:\n✖ Breaking statement in an expand migration: ALTER TABLE "posts" DROP COLUMN "body"');
    expect(unsafe.output).toContain("→ Move it to contract/0100_widgets.sql");
    expect(unsafe.output).toContain("0100_widgets:\n✖ CREATE INDEX CONCURRENTLY cannot run in a transaction");
    expect(unsafe.output).not.toContain("widgets_name_idx");
    expect(unsafe.output).not.toContain("DROP CONSTRAINT");
    expect(unsafe.output).not.toContain("0101_posts-author-index");
    expect(unsafe.output).toContain(
      "0102_posts-two-indexes:\n✖ A -- nuxvel:no-transaction migration holds exactly one statement, this one holds 2",
    );
    expect(unsafe.output).toContain("✖ 4 unsafe migration statements");
  });

  it("db:check fails on a migration merged from another branch that a migrated database would skip", async () => {
    const appDir = scratchPlayground("db-check-order");
    const journalFile = join(appDir, "server", "database", "migrations", "meta", "_journal.json");

    const clean = await runCliAt(appDir, "db:check");
    expect(clean.exitCode, clean.stderr).toBe(0);
    expect(stripAnsi(clean.stderr)).toContain("✔ Every migration is in order");

    addMigration(appDir, "0100_from-main", 'ALTER TABLE "posts" ADD COLUMN "a" text;');
    const journal = readJournal(appDir);
    const main = journal.entries.at(-1);
    if (!main) throw new Error("no journal entry");
    journal.entries.push({ ...main, when: main.when - 1, tag: "0100_from-branch" });
    writeFileSync(journalFile, JSON.stringify(journal, null, 2));
    writeFileSync(join(appDir, "server", "database", "migrations", "0100_from-branch.sql"), 'ALTER TABLE "posts" ADD COLUMN "b" text;');

    const merged = await runCliAt(appDir, "db:check");
    const output = stripAnsi(merged.stderr);
    expect(merged.exitCode, output).toBe(1);
    expect(output).toContain(
      "0100_from-branch:\n✖ Generated before 0100_from-main, which comes first: a database that applied 0100_from-main skips it",
    );
    expect(output).toContain("0100_from-branch:\n✖ Has the same number as 0100_from-main: two branches each generated a migration");
    expect(output).toContain("✖ 1 migration out of order");
    expect(output).toContain("→ Generate each one again after the migrations from the other branch");
  });

  it("db:migrate creates the expected tables in a fresh database, connecting as NUXT_DATABASE_OWNER_URL", async () => {
    const appDir = scratchPlayground("db-migrate");
    const databaseUrl = await scratchDatabase("migrate");

    const env = {
      ...process.env,
      NUXT_DATABASE_OWNER_URL: databaseUrl,
      NUXT_DATABASE_URL: "postgres://nobody@127.0.0.1:1/unreachable",
    };
    const migrationsDir = join(appDir, "server", "database", "migrations");
    const migrations = [
      ...readJournal(appDir).entries.map((entry) => entry.tag),
      ...readdirSync(join(migrationsDir, "contract")).map((name) => `contract/${name.replace(/\.sql$/, "")}`),
    ];

    const first = await runCliWithEnv(appDir, env, "db:migrate");
    const applied = stripAnsi(first.stderr);

    expect(first.exitCode, applied).toBe(0);
    expect(first.stdout).toBe("");
    expect(applied).toContain(`Connected as NUXT_DATABASE_OWNER_URL (${new URL(databaseUrl).host}${new URL(databaseUrl).pathname})`);
    expect(applied).toMatch(new RegExp(`◇ Applied ${migrations.length} migrations \\(\\d+m?s\\)`));
    for (const migration of migrations) expect(applied).toContain(`│    ${migration}`);
    expect(applied).toContain("└  Database is up to date");

    expect(applied).toContain("◇  Audit log partitions: created 0, dropped 0");

    const sql = scratchSql(databaseUrl);
    const now = new Date();
    const partitions = [0, 1, 2, 3].map((offset) => {
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      return `audit_log_y${month.getUTCFullYear()}m${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
    });
    const partitionNames = async () =>
      (await sql<{ name: string }[]>`select tablename as name from pg_tables where tablename like 'audit_log_y%'`).map(
        (row) => row.name,
      );

    expect(await partitionNames()).toEqual(expect.arrayContaining(partitions));
    await sql.unsafe(`drop table "${partitions[3]}"`);

    const second = await runCliWithEnv(appDir, env, "db:migrate");

    expect(second.exitCode, second.stderr).toBe(0);
    expect(second.stdout).toBe("");
    expect(stripAnsi(second.stderr)).toContain("└  Already up to date");
    expect(stripAnsi(second.stderr)).not.toContain("Applied");
    expect(stripAnsi(second.stderr)).toContain(`◇  Audit log partitions: created 1, dropped 0\n│    created ${partitions[3]}`);
    expect(await partitionNames()).toEqual(expect.arrayContaining(partitions));

    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public'
    `;
    const tableNames = rows.map((row) => row.table_name);

    for (const table of ["posts", "health_checks", "user", "account", "session", "verification", "audit_log"]) {
      expect(tableNames).toContain(table);
    }
  });

  it("db:migrate gives up on a migration blocked by a held lock after 3 retries, with the lock timeout error", async () => {
    const appDir = scratchPlayground("db-migrate-lock");
    const databaseUrl = await scratchDatabase("migrate-lock");
    const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl };

    expect((await runCliWithEnv(appDir, env, "db:migrate")).exitCode).toBe(0);

    addMigration(appDir, "0100_posts-summary", 'ALTER TABLE "posts" ADD COLUMN "summary" text;');

    const holder = scratchSql(databaseUrl);
    let release = () => {};
    let locked = () => {};
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const held = holder.begin(async (tx) => {
      await tx`lock table posts in access exclusive mode`;
      locked();
      await new Promise<void>((resolve) => (release = resolve));
    });

    try {
      await lockTaken;

      const url = new URL(databaseUrl);
      url.searchParams.set("lock_timeout", "100ms");
      const blocked = await runCliWithEnv(appDir, { ...env, NUXT_DATABASE_URL: url.toString() }, "db:migrate");
      const output = stripAnsi(blocked.stderr);

      expect(blocked.exitCode, output).toBe(1);
      for (const retry of [1, 2, 3]) expect(output).toContain(`Timed out waiting for a lock, retry ${retry} of 3`);
      expect(output).not.toContain("retry 4");
      expect(output).toContain("✖ canceling statement due to lock timeout");
      expect(output).toContain("→ Another session holds a lock that a migration needs");
    } finally {
      release();
      await held;
    }

    const applied = await runCliWithEnv(appDir, env, "db:migrate");

    expect(applied.exitCode, applied.stderr).toBe(0);
    expect(stripAnsi(applied.stderr)).toContain("0100_posts-summary");
  }, 60000);

  it("db:migrate runs a no-transaction index concurrently over an invalid one, then contract migrations once their backfill completed", async () => {
    const appDir = scratchPlayground("db-migrate-contract");
    const databaseUrl = await scratchDatabase("migrate-contract");
    const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl };
    const sql = scratchSql(databaseUrl);
    const migrate = async () => {
      const { exitCode, stderr } = await runCliWithEnv(appDir, env, "db:migrate");
      return { exitCode, output: stripAnsi(stderr) };
    };

    addMigration(appDir, "0100_widgets", 'CREATE TABLE "widgets" ("id" serial PRIMARY KEY, "name" text, "label" text);');
    expect((await migrate()).exitCode).toBe(0);

    await sql`insert into widgets (name) values ('same'), ('same')`;
    await expect(sql`create unique index concurrently widgets_name_idx on widgets (name)`).rejects.toThrow();
    await sql`delete from widgets`;

    addMigration(
      appDir,
      "0101_widgets-name-index",
      '-- nuxvel:no-transaction\nCREATE UNIQUE INDEX CONCURRENTLY "widgets_name_idx" ON "widgets" ("name");',
    );
    addMigration(appDir, "0102_widgets-title", 'ALTER TABLE "widgets" ADD COLUMN "title" text;');
    mkdirSync(join(appDir, "server", "database", "migrations", "contract"), { recursive: true });
    writeFileSync(
      join(appDir, "server", "database", "migrations", "contract", "0102_widgets-title.sql"),
      '-- nuxvel:requires-backfill=copy-widget-labels\nALTER TABLE "widgets" DROP COLUMN "label";',
    );

    const deferred = await migrate();

    expect(deferred.exitCode, deferred.output).toBe(0);
    expect(deferred.output).toContain("0101_widgets-name-index");
    expect(deferred.output).toContain("0102_widgets-title");
    expect(deferred.output).toContain("▲ Deferred 1 migration waiting on a backfill");
    expect(deferred.output).toContain("contract/0102_widgets-title");
    expect(
      await sql`select i.indisvalid as valid from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = 'widgets_name_idx'`,
    ).toEqual([{ valid: true }]);
    expect(await sql`select 1 from information_schema.columns where table_name = 'widgets' and column_name = 'label'`).toHaveLength(1);

    const stillDeferred = await migrate();

    expect(stillDeferred.exitCode, stillDeferred.output).toBe(0);
    expect(stillDeferred.output).toContain("No pending migrations");
    expect(stillDeferred.output).toContain("▲ Deferred 1 migration waiting on a backfill");
    expect(stillDeferred.output).toContain("contract/0102_widgets-title");
    expect(stillDeferred.output).not.toContain("Already up to date");

    await sql`insert into backfills (name, total, completed_at) values ('copy-widget-labels', 0, now())`;
    const contracted = await migrate();

    expect(contracted.exitCode, contracted.output).toBe(0);
    expect(contracted.output).toContain("Applied 1 migration");
    expect(contracted.output).toContain("contract/0102_widgets-title");
    expect(await sql`select 1 from information_schema.columns where table_name = 'widgets' and column_name = 'label'`).toHaveLength(0);
    expect(await sql`select name from drizzle.__nuxvel_contract_migrations`).toContainEqual({ name: "0102_widgets-title" });

    const again = await migrate();

    expect(again.exitCode, again.output).toBe(0);
    expect(again.output).toContain("Already up to date");
  }, 60000);

  it("db:migrate on a fresh database applies each contract migration right after its own migration", async () => {
    const appDir = scratchPlayground("db-migrate-fresh-contract");
    const databaseUrl = await scratchDatabase("migrate-fresh-contract");
    const sql = scratchSql(databaseUrl);

    addMigration(appDir, "0100_widgets", 'CREATE TABLE "widgets" ("id" serial PRIMARY KEY, "label" text);');
    mkdirSync(join(appDir, "server", "database", "migrations", "contract"), { recursive: true });
    writeFileSync(join(appDir, "server", "database", "migrations", "contract", "0100_widgets.sql"), 'ALTER TABLE "widgets" DROP COLUMN "label";');
    addMigration(appDir, "0101_widgets-label", 'ALTER TABLE "widgets" ADD COLUMN "label" integer;');

    const { exitCode, stderr } = await runCliWithEnv(appDir, { ...process.env, NUXT_DATABASE_URL: databaseUrl }, "db:migrate");

    expect(exitCode, stripAnsi(stderr)).toBe(0);
    expect(await sql`select data_type from information_schema.columns where table_name = 'widgets' and column_name = 'label'`).toEqual([
      { data_type: "integer" },
    ]);
  }, 60000);

  it("db:rollback applies the down migration of the last migration, and warns when it has none", async () => {
    const appDir = scratchPlayground("db-rollback");
    const databaseUrl = await scratchDatabase("rollback");
    const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl };
    const summaryColumns = async () => {
      const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
      try {
        const rows = await sql`select 1 from information_schema.columns where table_name = 'posts' and column_name = 'summary'`;
        return rows.length;
      } finally {
        await sql.end();
      }
    };

    expect((await runCliWithEnv(appDir, env, "db:migrate")).exitCode).toBe(0);

    const refused = await runCliWithEnv(appDir, { ...env, NODE_ENV: "production" }, "db:rollback");

    expect(refused.exitCode).toBe(1);
    expect(stripAnsi(refused.stderr)).toContain("✖ Refusing to roll back: NODE_ENV is production");

    const journal: { entries: { tag: string }[] } = JSON.parse(
      readFileSync(join(appDir, "server", "database", "migrations", "meta", "_journal.json"), "utf8"),
    );
    const lastTag = journal.entries.at(-1)?.tag;
    const missing = await runCliWithEnv(appDir, env, "db:rollback");

    expect(missing.exitCode).toBe(1);
    expect(stripAnsi(missing.stderr)).toContain(`▲ No down migration for ${lastTag}`);
    expect(stripAnsi(missing.stderr)).toContain(
      `→ Write the SQL that undoes it in server/database/migrations/down/${lastTag}.sql`,
    );

    addMigration(appDir, "0100_posts-summary", 'ALTER TABLE "posts" ADD COLUMN "summary" text;');
    mkdirSync(join(appDir, "server", "database", "migrations", "down"));
    writeFileSync(
      join(appDir, "server", "database", "migrations", "down", "0100_posts-summary.sql"),
      'ALTER TABLE "posts" DROP COLUMN "summary";\n',
    );

    expect((await runCliWithEnv(appDir, env, "db:migrate")).exitCode).toBe(0);
    expect(await summaryColumns()).toBe(1);

    const rolledBack = await runCliWithEnv(appDir, env, "db:rollback");

    expect(rolledBack.exitCode, rolledBack.stderr).toBe(0);
    expect(stripAnsi(rolledBack.stderr)).toContain("◇  Rolled back 0100_posts-summary");
    expect(await summaryColumns()).toBe(0);

    const reapplied = await runCliWithEnv(appDir, env, "db:migrate");

    expect(stripAnsi(reapplied.stderr)).toContain("Applied 1 migration");
    expect(await summaryColumns()).toBe(1);
  }, 60000);

  it("db:migrate reads the database URL from the app's .env", async () => {
    const appDir = scratchPlayground("db-migrate-env-file");
    const databaseUrl = await scratchDatabase("migrate-env-file");
    const { NUXT_DATABASE_URL: _url, NUXT_DATABASE_OWNER_URL: _ownerUrl, ...env } = process.env;

    writeFileSync(join(appDir, ".env"), `NUXT_DATABASE_URL=${databaseUrl}\n`);

    const migrated = await runCliWithEnv(appDir, env, "db:migrate");

    expect(migrated.exitCode, migrated.stderr).toBe(0);

    const sql = scratchSql(databaseUrl);
    const rows = await sql`select 1 from information_schema.tables where table_name = 'posts'`;
    expect(rows).toHaveLength(1);
  }, 30000);

  it("db:migrate, doctor and build:manifest use the migrations folder and table drizzle.config.ts names", async () => {
    const appDir = scratchPlayground("db-migrate-config");
    const databaseUrl = await scratchDatabase("migrate-config");
    const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl };
    const migrations = readdirSync(join(appDir, "server", "database", "migrations")).filter((name) =>
      name.endsWith(".sql"),
    );

    renameSync(join(appDir, "server", "database", "migrations"), join(appDir, "migrations"));
    writeFileSync(
      join(appDir, "drizzle.config.ts"),
      [
        'import { defineConfig } from "drizzle-kit";',
        "",
        "export default defineConfig({",
        '  schema: "./server/database/schema/**/*.ts",',
        '  out: "./migrations",',
        '  dialect: "postgresql",',
        '  migrations: { table: "applied_migrations", schema: "public" },',
        "});",
        "",
      ].join("\n"),
    );

    const pendingMigrations = async () => {
      const doctor = await runCliWithEnv(appDir, env, "doctor", "--json");
      const report: { checks: Array<{ name: string; status: string; findings: Array<{ detail: string }> }> } =
        JSON.parse(doctor.stdout);
      return report.checks.find((check) => check.name === "pending migrations");
    };

    const pendingBefore = await pendingMigrations();
    const migrated = await runCliWithEnv(appDir, env, "db:migrate");
    const pendingAfter = await pendingMigrations();
    const manifest = await runCliWithEnv(appDir, env, "build:manifest");

    expect(pendingBefore).toMatchObject({
      status: "warning",
      findings: [{ detail: `${migrations.length} pending migrations` }],
    });
    expect(migrated.exitCode, migrated.stderr).toBe(0);
    expect(pendingAfter?.status).toBe("passed");
    expect(manifest.exitCode, manifest.stderr).toBe(0);
    expect(manifest.stdout).toBe("");
    expect(stripAnsi(manifest.stderr)).toMatch(/^✔ Wrote nuxvel-manifest\.json: node /);
    expect(JSON.parse(readFileSync(join(appDir, "nuxvel-manifest.json"), "utf8"))).toMatchObject({
      migrations: migrations.length,
    });

    const sql = scratchSql(databaseUrl);
    const [applied] = await sql<{ count: number }[]>`select count(*)::int as count from public.applied_migrations`;
    expect(applied?.count).toBe(migrations.length);
  }, 30000);

  it("db:migrate refuses and doctor fails when a migration that ran was edited, or is no longer in the journal", async () => {
    const appDir = scratchPlayground("db-migrate-changed");
    const databaseUrl = await scratchDatabase("migrate-changed");
    const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl };
    const migrationsDir = join(appDir, "server", "database", "migrations");
    const journalFile = join(migrationsDir, "meta", "_journal.json");
    const journalSource = readFileSync(journalFile, "utf8");
    const journal: { entries: { tag: string; when: number }[] } = JSON.parse(journalSource);
    const first = journal.entries[0];
    const last = journal.entries.at(-1);
    if (!first || !last) throw new Error("The playground has no migration");
    const firstFile = join(migrationsDir, `${first.tag}.sql`);
    const firstSource = readFileSync(firstFile, "utf8");
    const hint = "Restore the file and put the change in a new migration, or rebuild a dev database with nuxvel db:fresh";
    const doctorCheck = async () => {
      const doctor = await runCliWithEnv(appDir, env, "doctor", "--json");
      const report: { checks: Array<{ name: string; status: string; findings: Array<{ detail: string; hint?: string }> }> } =
        JSON.parse(doctor.stdout);
      return report.checks.find((check) => check.name === "pending migrations");
    };

    const applied = await runCliWithEnv(appDir, env, "db:migrate");

    expect(applied.exitCode, applied.stderr).toBe(0);

    writeFileSync(firstFile, `${firstSource}\n-- edited`);
    const edited = await runCliWithEnv(appDir, env, "db:migrate");

    expect(edited.exitCode).toBe(1);
    expect(stripAnsi(edited.stderr)).toContain(`✖ ${first.tag} changed after it ran on this database`);
    expect(stripAnsi(edited.stderr)).toContain(hint);
    expect(await doctorCheck()).toMatchObject({
      status: "failed",
      findings: [{ detail: `${first.tag} changed after it ran on this database`, hint }],
    });

    writeFileSync(firstFile, firstSource);
    writeFileSync(journalFile, journalSource.replace(`"when": ${last.when}`, `"when": ${last.when + 1}`));
    const regenerated = await runCliWithEnv(appDir, env, "db:migrate");
    const missing = `the migration that ran at ${new Date(last.when).toISOString()} is not in meta/_journal.json`;

    expect(regenerated.exitCode).toBe(1);
    expect(stripAnsi(regenerated.stderr)).toContain(`✖ ${missing}`);
    expect(await doctorCheck()).toMatchObject({ status: "failed", findings: [{ detail: missing, hint }, { status: "warning" }] });
  }, 30000);

  it("db:migrate, backfill:status, audit:tail and audit:export exit 1 naming the unset database URL", async () => {
    const appDir = scratchPlayground("db-migrate");
    const { NUXT_DATABASE_URL: _url, NUXT_DATABASE_OWNER_URL: _ownerUrl, ...env } = process.env;
    const migrate = await runCliWithEnv(appDir, env, "db:migrate");
    expect(migrate.exitCode).toBe(1);
    expect(migrate.stderr).toContain("✖ NUXT_DATABASE_OWNER_URL or NUXT_DATABASE_URL is not set");
    expect(migrate.stderr).toContain("→ Set NUXT_DATABASE_URL in .env or the shell");

    for (const command of ["backfill:status", "audit:tail", "audit:export"]) {
      const result = await runCliWithEnv(appDir, env, command);
      expect(result.exitCode, command).toBe(1);
      expect(result.stderr, command).toContain("✖ NUXT_DATABASE_URL is not set");
    }
  }, 120000);

  it("db:seed runs every seeder or the named ones and prints the lines a seeder returns, db:fresh drops and migrates and seeds only with --seed, and both refuse in production", async () => {
    const appDir = scratchPlayground("db-seed");
    const databaseUrl = await scratchDatabase("seed");
    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: await emptyWorkerRedis(),
      NUXT_AUTH_SECRET: "seed-test-secret-seed-test-secret-seed",
    };
    const production = { ...env, NODE_ENV: "production" };
    const authors = async () => {
      const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
      try {
        const rows = await sql`select 1 from "user" where email = 'seeded-author@example.com'`;
        return rows.length;
      } finally {
        await sql.end();
      }
    };

    expect((await runCliWithEnv(appDir, env, "db:migrate")).exitCode).toBe(0);

    const refusedSeed = await runCliWithEnv(appDir, production, "db:seed");
    expect(refusedSeed.exitCode).toBe(1);
    expect(stripAnsi(refusedSeed.stderr)).toContain("✖ Refusing to seed: NODE_ENV is production");
    expect(stripAnsi(refusedSeed.stderr)).toContain("→ Pass --force to seed this database anyway");

    const unknown = await runCliWithEnv(appDir, env, "db:seed", "nope");
    expect(unknown.exitCode).toBe(1);
    expect(stripAnsi(unknown.stderr)).toContain('✖ no seeder named "nope"');
    expect(stripAnsi(unknown.stderr)).toContain("→ A seeder is a file under server/seeders");

    const named = await runCliWithEnv(appDir, env, "db:seed", "_probe.posts");
    expect(named.exitCode, named.stderr).toBe(0);
    expect(stripAnsi(named.stderr)).toMatch(/✔ Seeded _probe\.author\n {2}Seeded Author is seeded-author@example\.com\n✔ Seeded _probe\.posts\n/);
    expect(await authors()).toBe(1);

    const again = await runCliWithEnv(appDir, env, "db:seed");
    expect(again.exitCode).toBe(1);
    expect(stripAnsi(again.stderr)).toContain('✖ Failed query: insert into "user"');
    expect(await authors()).toBe(1);

    const unconfirmed = await runCliWithEnv(appDir, env, "db:fresh");
    expect(unconfirmed.exitCode).toBe(1);
    expect(stripAnsi(unconfirmed.stderr)).toContain("needs a confirmation");
    expect(stripAnsi(unconfirmed.stderr)).toContain("→ Pass --force to run it without asking");

    const refusedFresh = await runCliWithEnv(appDir, production, "db:fresh", "--force");
    expect(refusedFresh.exitCode).toBe(1);
    expect(stripAnsi(refusedFresh.stderr)).toContain("✖ Refusing to run db:fresh: NODE_ENV is production");
    expect(await authors()).toBe(1);

    const fresh = await runCliWithEnv(appDir, env, "db:fresh", "--force");
    const freshOutput = stripAnsi(fresh.stderr);
    expect(fresh.exitCode, freshOutput).toBe(0);
    expect(freshOutput).toMatch(/◇ {2}Dropped \d+ tables in /);
    expect(freshOutput).toContain("└  Database is up to date");
    expect(freshOutput).not.toContain("Seeded");
    expect(await authors()).toBe(0);

    const seeded = await runCliWithEnv(appDir, env, "db:fresh", "--seed", "--force");
    const seededOutput = stripAnsi(seeded.stderr);
    expect(seeded.exitCode, seededOutput).toBe(0);
    expect(seededOutput).toContain("✔ Seeded _probe.posts");
    expect(await authors()).toBe(1);
  }, 240000);

  it("db:seed runs a seeder that imports through #server and #shared", async () => {
    const appDir = scratchPlayground("db-seed-aliases");
    const databaseUrl = await scratchDatabase("seed-aliases");
    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: await emptyWorkerRedis(),
      NUXT_AUTH_SECRET: "seed-test-secret-seed-test-secret-seed",
    };
    mkdirSync(join(appDir, "shared"), { recursive: true });
    writeFileSync(join(appDir, "shared", "aliased-name.ts"), 'export const aliasedName = "Aliased Author";\n');
    writeFileSync(join(appDir, "server", "utils", "aliased-email.ts"), 'export const aliasedEmail = "aliased-author@example.com";\n');
    writeFileSync(
      join(appDir, "server", "seeders", "aliased.seeder.ts"),
      [
        'import { aliasedEmail } from "#server/utils/aliased-email";',
        'import { userFactory } from "#server/factories/users.factory";',
        'import { aliasedName } from "#shared/aliased-name";',
        "",
        "export default defineSeeder(async () => {",
        "  await userFactory({ name: aliasedName, email: aliasedEmail });",
        "});",
        "",
      ].join("\n"),
    );

    expect((await runCliWithEnv(appDir, env, "db:migrate")).exitCode).toBe(0);

    const seeded = await runCliWithEnv(appDir, env, "db:seed", "aliased");
    expect(seeded.exitCode, seeded.stderr).toBe(0);
    expect(stripAnsi(seeded.stderr)).toContain("✔ Seeded aliased");

    const sql = scratchSql(databaseUrl);
    const rows = await sql`select name from "user" where email = 'aliased-author@example.com'`;
    expect(rows.map((row) => row.name)).toEqual(["Aliased Author"]);
  }, 180000);

  it("db:seed builds the server of an app with a prerendered route", async () => {
    const appDir = scratchPlayground("db-seed-prerender");
    const databaseUrl = await scratchDatabase("seed-prerender");
    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: await emptyWorkerRedis(),
      NUXT_AUTH_SECRET: "seed-test-secret-seed-test-secret-seed",
    };
    const configFile = join(appDir, "nuxt.config.ts");

    writeFileSync(
      configFile,
      readFileSync(configFile, "utf8").replace("  devtools:", "  routeRules: { '/sign-in': { prerender: true } },\n  devtools:"),
    );

    expect((await runCliWithEnv(appDir, env, "db:migrate")).exitCode).toBe(0);

    const seeded = await runCliWithEnv(appDir, env, "db:seed", "_probe.posts");
    expect(stripAnsi(seeded.stderr)).not.toContain("H3Event");
    expect(seeded.exitCode, seeded.stderr).toBe(0);
  }, 120000);

  it("db:seed --volume fills the app's tables with generated rows, skipping the tables of nuxvel, those with a tsvector column and those that reference them", async () => {
    const appDir = scratchPlayground("db-seed-volume");
    const databaseUrl = await scratchDatabase("seed-volume");
    const env = { ...process.env, NUXT_DATABASE_URL: databaseUrl };

    expect((await runCliWithEnv(appDir, env, "db:migrate")).exitCode).toBe(0);

    const seeded = await runCliWithEnv(appDir, env, "db:seed", "--volume");
    const output = stripAnsi(seeded.stderr);
    expect(seeded.exitCode, output).toBe(0);
    expect(output).toContain("  skip posts: it has a tsvector column");
    expect(output).toContain("  skip audit_log: a table of nuxvel");
    expect(output).toContain("  skip billing_payments: a table of nuxvel");
    expect(output).toMatch(/✔ Filled .*\buser\b.* with 1000 rows each/);

    const sql = scratchSql(databaseUrl);
    const count = async (table: string) => (await sql.unsafe<{ count: number }[]>(`select count(*)::int as count from "${table}"`))[0]?.count;
    expect(await count("user")).toBe(1000);
    expect(await count("health_checks")).toBe(1000);
    expect(await count("posts")).toBe(0);
    expect(await count("audit_log")).toBe(0);
    expect(await count("outbox")).toBe(0);
    const [tag] = await sql<{ id: number }[]>`insert into tags (name) values ('after the volume') returning id`;
    expect(tag?.id).toBeGreaterThan(1000);

    const refused = await runCliWithEnv(appDir, { ...env, NODE_ENV: "production" }, "db:seed", "--volume");
    expect(refused.exitCode).toBe(1);
    expect(stripAnsi(refused.stderr)).toContain("Refusing to seed: NODE_ENV is production");
  }, 120000);

  it("make:seeder writes a seeder under server/seeders, from a custom template when the app has one", async () => {
    const fixtureCwd = scratchDir("make-seeder");

    buildNuxtFixture(fixtureCwd);

    const made = await runCliAt(fixtureCwd, "make:seeder", "blog.posts");

    expect(made.exitCode, made.stderr).toBe(0);
    expect(stripAnsi(made.stdout)).toContain("✔ Created server/seeders/blog/posts.seeder.ts");
    expect(readFileSync(join(fixtureCwd, "server", "seeders", "blog", "posts.seeder.ts"), "utf-8")).toBe(
      'export const blogPostsSeeder = defineSeeder(async () => {\n  return [];\n});\n',
    );

    mkdirSync(join(fixtureCwd, ".nuxvel", "templates"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, ".nuxvel", "templates", "seeder.ts.txt"),
      'export default defineSeeder(async ({ call }) => {\n  await call("{{name}}");\n});\n',
    );

    const custom = await runCliAt(fixtureCwd, "make:seeder", "database");

    expect(custom.exitCode, custom.stderr).toBe(0);
    expect(readFileSync(join(fixtureCwd, "server", "seeders", "database.seeder.ts"), "utf-8")).toContain(
      'await call("database");',
    );
  }, 60000);
});
