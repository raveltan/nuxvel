import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { transformSync } from "esbuild";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { bootEnv, buildNuxtFixture, buildServerFixture } from "./helpers/fixtures.ts";
import { execFileAsync, runBinAt, runCliAt, runCliInTty, runCliWithEnv, stripAnsi } from "./helpers/run.ts";
import { linkNodeModules, playgroundDir, scratchDir, scratchPlayground } from "./helpers/scratch.ts";

describe("nuxvel make:* generators", () => {
  it("make:schema writes a Drizzle table file and insert/update Zod schemas", async () => {
    const fixtureCwd = scratchDir("make-schema");

    buildNuxtFixture(fixtureCwd);

    const { exitCode } = await runCliAt(fixtureCwd, "make:schema", "widget-item");

    expect(exitCode).toBe(0);

    const tableFile = readFileSync(join(fixtureCwd, "server", "database", "schema", "widget-item.schema.ts"), "utf-8");
    expect(tableFile).toContain('export const widgetItemTable = pgTable("widget_item", {');
    expect(tableFile).toContain("...timestamps(),");
    expect(tableFile).toContain("export type WidgetItemRow = typeof widgetItemTable.$inferSelect;");
    expect(tableFile).toContain("export type NewWidgetItemRow = typeof widgetItemTable.$inferInsert;");

    const zodFile = readFileSync(join(fixtureCwd, "shared", "schemas", "widget-item.ts"), "utf-8");
    expect(zodFile).toContain("export const widgetItemIdInput = z.object({");
    expect(zodFile).toContain("export const createWidgetItemInput = z.object({});");
    expect(zodFile).toContain("export const updateWidgetItemInput = createWidgetItemInput.partial().extend({");
    expect(zodFile).toContain("id: widgetItemIdInput.shape.id,");
    expect(zodFile).toContain(
      "// Sent to the browser as the output of every procedure that uses it: list only columns every caller may see.\nexport const widgetItemSchema = z.object({\n  id: z.number(),\n  createdAt: z.date(),\n  updatedAt: z.date(),\n});",
    );
  });

  it("make:schema --soft-deletes adds the softDeletes() column", async () => {
    const fixtureCwd = scratchDir("make-schema-soft-deletes");

    buildNuxtFixture(fixtureCwd);

    const { exitCode } = await runCliAt(fixtureCwd, "make:schema", "widget-item", "--soft-deletes");

    expect(exitCode).toBe(0);

    const tableFile = readFileSync(join(fixtureCwd, "server", "database", "schema", "widget-item.schema.ts"), "utf-8");
    expect(tableFile).toContain('import { softDeletes, timestamps } from "@nuxvel/nuxt/database";');
    expect(tableFile).toContain("  ...timestamps(),\n  ...softDeletes(),\n");
  });

  it("make:schema --searchable adds a text column for each name, a search index over them, and their Zod fields", async () => {
    const fixtureCwd = scratchDir("make-schema-searchable");

    buildNuxtFixture(fixtureCwd);

    const { exitCode } = await runCliAt(fixtureCwd, "make:schema", "note", "--searchable", "title,body_text");

    expect(exitCode).toBe(0);

    const tableFile = readFileSync(join(fixtureCwd, "server", "database", "schema", "note.schema.ts"), "utf-8");
    expect(tableFile).toContain('import { pgTable, serial, text } from "drizzle-orm/pg-core";');
    expect(tableFile).toContain('import { searchable, searchIndex, timestamps } from "@nuxvel/nuxt/database";');
    expect(tableFile).toContain('  bodyText: text("body_text").notNull(),\n  ...searchable(["title", "body_text"]),\n');
    expect(tableFile).toContain("}, (table) => [searchIndex(table)]);");

    const zodFile = readFileSync(join(fixtureCwd, "shared", "schemas", "note.ts"), "utf-8");
    expect(zodFile).toContain("  bodyText: z.string().trim().min(1),\n");
    expect(zodFile).toContain("  bodyText: z.string(),\n  createdAt: z.date(),\n");

    const invalid = await runCliAt(fixtureCwd, "make:schema", "memo", "--searchable", "Title");

    expect(invalid.exitCode).toBe(1);
    expect(stripAnsi(invalid.stderr)).toContain('"Title" is not a valid column name');
  });

  it("make:schema with fields writes each field as a Drizzle column and a Zod field", async () => {
    const fixtureCwd = scratchDir("make-schema-fields");

    buildServerFixture(fixtureCwd);
    writeFileSync(join(fixtureCwd, "package.json"), '{ "type": "module" }\n');

    expect((await runCliAt(fixtureCwd, "make:schema", "project")).exitCode).toBe(0);

    const { exitCode, stderr } = await runCliAt(
      fixtureCwd,
      "make:schema",
      "task",
      "title",
      "notes:text:nullable",
      "contactEmail:email:unique",
      "position:integer:default=0",
      "views:bigint",
      "done:boolean:default=false",
      "price:decimal=8,2",
      "external_id:uuid",
      "due_on:date:index",
      "remind_at:timestamp:nullable",
      "meta:json",
      "status:enum=draft,done:default=draft",
      "project:references",
      "reviewer:references=user:nullable",
    );

    expect(exitCode, stderr).toBe(0);

    const tableFile = readFileSync(join(fixtureCwd, "server", "database", "schema", "task.schema.ts"), "utf-8");
    expect(tableFile).toContain(
      'import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";',
    );
    expect(tableFile).toContain('import { projectTable } from "./project.schema";\nimport { userTable } from "./auth.schema";\n');
    for (const column of [
      'title: varchar("title", { length: 255 }).notNull(),',
      'notes: text("notes"),',
      'contactEmail: varchar("contact_email", { length: 255 }).notNull().unique(),',
      'position: integer("position").notNull().default(0),',
      'views: bigint("views", { mode: "number" }).notNull(),',
      'done: boolean("done").notNull().default(false),',
      'price: numeric("price", { precision: 8, scale: 2 }).notNull(),',
      'externalId: uuid("external_id").notNull(),',
      'dueOn: date("due_on").notNull(),',
      'remindAt: timestamp("remind_at"),',
      'meta: jsonb("meta").notNull(),',
      'status: text("status", { enum: ["draft", "done"] }).notNull().default("draft"),',
      'projectId: integer("project_id").notNull().references(() => projectTable.id, { onDelete: "cascade" }),',
      'reviewerId: text("reviewer_id").references(() => userTable.id, { onDelete: "set null" }),',
    ]) {
      expect(tableFile).toContain(`  ${column}\n`);
    }
    expect(tableFile).toContain(
      '}, (table) => [index("task_due_on_idx").on(table.dueOn), index("task_project_id_idx").on(table.projectId), index("task_reviewer_id_idx").on(table.reviewerId)]);',
    );

    const zodFile = readFileSync(join(fixtureCwd, "shared", "schemas", "task.ts"), "utf-8");
    for (const field of [
      "title: z.string().trim().min(1).max(255),",
      "notes: z.string().trim().min(1).nullish(),",
      "contactEmail: z.email().max(255),",
      "position: z.number().int().optional(),",
      "done: z.boolean().optional(),",
      "price: z.string().regex(/^-?\\d+(\\.\\d+)?$/),",
      "externalId: z.uuid(),",
      "dueOn: z.iso.date(),",
      "remindAt: z.date().nullish(),",
      "meta: z.json(),",
      'status: z.enum(["draft", "done"]).optional(),',
      "projectId: z.number().int().positive(),",
      "reviewerId: z.string().min(1).nullish(),",
    ]) {
      expect(zodFile).toContain(`  ${field}\n`);
    }
    expect(zodFile).toContain("export const updateTaskInput = createTaskInput.partial().extend({");
    expect(zodFile).toContain(
      [
        "export const taskSchema = z.object({",
        "  id: z.number(),",
        "  title: z.string(),",
        "  notes: z.string().nullable(),",
        "  contactEmail: z.string(),",
        "  position: z.number(),",
        "  views: z.number(),",
        "  done: z.boolean(),",
        "  price: z.string(),",
        "  externalId: z.string(),",
        "  dueOn: z.string(),",
        "  remindAt: z.date().nullable(),",
        "  meta: z.unknown(),",
        '  status: z.enum(["draft", "done"]),',
        "  projectId: z.number(),",
        "  reviewerId: z.string().nullable(),",
        "  createdAt: z.date(),",
        "  updatedAt: z.date(),",
        "});",
      ].join("\n"),
    );

    const missing = await runCliAt(fixtureCwd, "make:schema", "comment", "post:references");

    expect(missing.exitCode).toBe(1);
    expect(stripAnsi(missing.stderr)).toContain("✖ The table post does not exist");
    expect(stripAnsi(missing.stderr)).toContain("→ Create it first: nuxvel make:schema post");
    expect(existsSync(join(fixtureCwd, "shared", "schemas", "comment.ts"))).toBe(false);
  }, 60000);

  it("make:schema writes a unique reference without a second index", async () => {
    const fixtureCwd = scratchDir("make-schema-unique-reference");

    buildServerFixture(fixtureCwd);
    writeFileSync(join(fixtureCwd, "package.json"), '{ "type": "module" }\n');

    expect((await runCliAt(fixtureCwd, "make:schema", "project")).exitCode).toBe(0);
    const profile = await runCliAt(fixtureCwd, "make:schema", "profile", "project:references:unique", "slug:unique:index");
    expect(profile.exitCode, profile.stderr).toBe(0);

    const tableFile = readFileSync(join(fixtureCwd, "server", "database", "schema", "profile.schema.ts"), "utf-8");
    expect(tableFile).toContain('projectId: integer("project_id").notNull().unique().references(');
    expect(tableFile).not.toContain("profile_project_id_idx");
    expect(tableFile).not.toContain("profile_slug_idx");
  }, 60000);

  it("make:router --crud writes an before a vowel sound in the OpenAPI summaries", async () => {
    const fixtureCwd = scratchDir("make-router-article");

    buildNuxtFixture(fixtureCwd);

    expect((await runCliAt(fixtureCwd, "make:router", "invoice", "--crud")).exitCode).toBe(0);

    const routerFile = readFileSync(join(fixtureCwd, "server", "trpc", "routers", "invoice.router.ts"), "utf-8");
    for (const summary of ["Get an invoice", "Create an invoice", "Update an invoice", "Delete an invoice"]) expect(routerFile).toContain(`summary: "${summary}"`);
    expect(routerFile).not.toContain("a invoice");
  }, 60000);

  it("make:policy writes a definePolicy skeleton bound to the matching schema table", async () => {
    const fixtureCwd = scratchDir("make-policy");

    buildNuxtFixture(fixtureCwd);

    const { exitCode } = await runCliAt(fixtureCwd, "make:policy", "widget-item");

    expect(exitCode).toBe(0);

    const policyFile = readFileSync(join(fixtureCwd, "server", "policies", "widget-item.policy.ts"), "utf-8");
    expect(policyFile).toContain('import { widgetItemTable } from "#nuxvel/schema";');
    expect(policyFile).toContain("export const widgetItemPolicy = definePolicy(widgetItemTable, {});");
  });

  it("make:task writes a defineTask skeleton under server/tasks", async () => {
    const fixtureCwd = scratchDir("make-task");

    buildNuxtFixture(fixtureCwd);

    const { exitCode } = await runCliAt(fixtureCwd, "make:task", "reindex-widgets");

    expect(exitCode).toBe(0);

    const taskFile = readFileSync(
      join(fixtureCwd, "server", "tasks", "reindex-widgets.ts"),
      "utf-8",
    );

    expect(taskFile).toContain("export default defineTask({");
    expect(taskFile).toContain('name: "reindex-widgets"');
  });

  it("make:mail writes a template built from the MJML mail components, styled with MJML attributes", async () => {
    const fixtureCwd = scratchDir("make-mail");

    buildNuxtFixture(fixtureCwd);

    expect((await runCliAt(fixtureCwd, "make:mail", "order.shipped")).exitCode).toBe(0);

    const template = readFileSync(join(fixtureCwd, "server", "mail", "order", "templates", "OrderShipped.vue"), "utf-8");

    expect(template).toContain('<MailLayout preview="Order shipped">');
    expect(template).toContain("<EHeading>Order shipped</EHeading>");
    expect(template).toContain('<EButton href="https://example.com" background-color="#4f46e5">Open the app</EButton>');
    expect(template).toMatch(/<EText[^>]*>[^<]*<ELink /);
    expect(template).not.toContain("class=");
  });

  it("make:flag and make:experiment write typed definitions under server/flags", async () => {
    const fixtureCwd = scratchDir("make-flag");

    buildNuxtFixture(fixtureCwd);

    expect((await runCliAt(fixtureCwd, "make:flag", "new-checkout")).exitCode).toBe(0);
    expect((await runCliAt(fixtureCwd, "make:experiment", "checkout-cta")).exitCode).toBe(0);

    expect(readFileSync(join(fixtureCwd, "server", "flags", "new-checkout.flag.ts"), "utf-8")).toBe(
      'export const newCheckoutFlag = defineFlag({ default: false });\n',
    );

    const experiment = readFileSync(join(fixtureCwd, "server", "flags", "checkout-cta.experiment.ts"), "utf-8");

    expect(experiment).toContain("export const checkoutCtaExperiment = defineExperiment({");
    expect(experiment).not.toContain("name:");
    expect(experiment).toContain("variants: { control: 50, treatment: 50 },");

    expect(readFileSync(join(fixtureCwd, ".nuxt", "nuxvel", "flags.ts"), "utf-8")).toContain(
      join(fixtureCwd, "server", "flags", "new-checkout.flag.ts"),
    );
  }, 60000);

  it("make:schedule writes a discovered defineSchedule under server/schedules, or under a domain folder", async () => {
    const fixtureCwd = scratchDir("make-schedule");

    buildNuxtFixture(fixtureCwd);

    expect((await runCliAt(fixtureCwd, "make:schedule", "posts.prune-drafts")).exitCode).toBe(0);
    expect((await runCliAt(fixtureCwd, "make:schedule", "send-digest", "--domain", "user")).exitCode).toBe(0);

    const scheduleFile = join(fixtureCwd, "server", "schedules", "posts", "prune-drafts.schedule.ts");
    const domainFile = join(fixtureCwd, "server", "domains", "user", "schedules", "send-digest.schedule.ts");

    expect(readFileSync(scheduleFile, "utf-8")).toBe(
      'export const postsPruneDraftsSchedule = defineSchedule({\n  at: { hour: 3 },\n  handler: async () => {\n    console.log("posts.prune-drafts");\n  },\n});\n',
    );
    expect(readFileSync(domainFile, "utf-8")).toContain("export const userSendDigestSchedule = defineSchedule({");

    const registry = readFileSync(join(fixtureCwd, ".nuxt", "nuxvel", "schedules.ts"), "utf-8");

    expect(registry).toContain(scheduleFile);
    expect(registry).toContain(domainFile);
  }, 60000);

  it("generators refuse to overwrite an existing file, compared case-insensitively, unless --force", async () => {
    const fixtureCwd = scratchDir("overwrite");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "tasks"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "flags"), { recursive: true });

    const taskFile = join(fixtureCwd, "server", "tasks", "reindex-widgets.ts");
    const flagFile = join(fixtureCwd, "server", "flags", "New-Checkout.flag.ts");
    writeFileSync(taskFile, "hand written\n");
    writeFileSync(flagFile, "hand written\n");

    const refused = await runCliAt(fixtureCwd, "make:task", "reindex-widgets");

    expect(refused.exitCode).toBe(1);
    expect(stripAnsi(refused.stderr)).toContain("✖ Refusing to overwrite server/tasks/reindex-widgets.ts");
    expect(stripAnsi(refused.stderr)).toContain("→ Pass --force to overwrite");
    expect(refused.stdout).toBe("");
    expect(readFileSync(taskFile, "utf-8")).toBe("hand written\n");

    const refusedCase = await runCliAt(fixtureCwd, "make:flag", "new-checkout");

    expect(refusedCase.exitCode).toBe(1);
    expect(refusedCase.stderr).toContain("server/flags/New-Checkout.flag.ts");
    expect(readFileSync(flagFile, "utf-8")).toBe("hand written\n");
    rmSync(flagFile);

    const forced = await runCliAt(fixtureCwd, "make:task", "reindex-widgets", "--force");

    expect(forced.exitCode).toBe(0);
    expect(readFileSync(taskFile, "utf-8")).toContain('name: "reindex-widgets"');
  }, 60000);

  it("make:* rejects a malformed name or a missing target, writing nothing", async () => {
    const fixtureCwd = scratchDir("names");
    const rejected: Array<{ args: string[]; message: string; hint: string }> = [
      { args: ["make:action", "widgets"], message: '"widgets" is not a valid action name', hint: "Use <domain>/<name>" },
      { args: ["make:action", "widgets/archive/now"], message: '"widgets/archive/now" is not a valid action name', hint: "Use <domain>/<name>" },
      { args: ["make:schema", "blogPost"], message: '"blogPost" is not a valid name', hint: "Use one kebab-case word" },
      { args: ["make:schema", "task", "id:integer"], message: '"id:integer": the name id is reserved', hint: "Use a different name" },
      { args: ["make:schema", "task", "owner_id"], message: '"owner_id": the name ownerId is reserved', hint: "Use a different name" },
      { args: ["make:schema", "task", "title", "title:text"], message: '"title:text": the field title occurs two times', hint: "Give each field a different name" },
      { args: ["make:schema", "task", "--searchable", "title", "title"], message: '"title": the field title occurs two times', hint: "Give each field a different name" },
      { args: ["make:schema", "task", "due:datetime"], message: '"due:datetime": "datetime" is not a known type', hint: "Use one of: string, text, email" },
      { args: ["make:schema", "task", "title:string:required"], message: '"title:string:required": "required" is not a known modifier', hint: "Use nullable, unique, index or default=<value>" },
      { args: ["make:schema", "task", "status:enum"], message: '"status:enum": the type enum needs its values', hint: "Write the values after the type" },
      { args: ["make:schema", "task", "price:decimal=8"], message: '"price:decimal=8": the type decimal takes a precision and a scale', hint: "Write two numbers" },
      { args: ["make:schema", "task", "done:boolean:default=yes"], message: '"done:boolean:default=yes": "yes" is not a valid default for the type boolean', hint: "Give a value of the field's type" },
      { args: ["make:schema", "task", "Title"], message: '"Title": "Title" is not a valid field name', hint: "Start the name with a lowercase letter" },
      { args: ["make:router", "blog_post"], message: '"blog_post" is not a valid name', hint: "Use one kebab-case word" },
      { args: ["make:module", "Billing"], message: '"Billing" is not a valid name', hint: "Use one kebab-case word" },
      { args: ["make:webhook", "stripe_billing"], message: '"stripe_billing" is not a valid name', hint: "Use kebab-case or camelCase words joined by . or /" },
      { args: ["make:mail", "billing/Receipt"], message: '"billing/Receipt" is not a valid name', hint: "Use kebab-case or camelCase words joined by . or /" },
      { args: ["make:job", "Post.notify"], message: '"Post.notify" is not a valid name', hint: "Use kebab-case or camelCase words joined by . or /" },
      { args: ["make:event", "post..published"], message: '"post..published" is not a valid name', hint: "Use kebab-case or camelCase words joined by . or /" },
      {
        args: ["make:factory", "gadgets"],
        message: "server/database/schema/gadgets.schema.ts does not exist",
        hint: "Create it first: nuxvel make:schema gadgets",
      },
      {
        args: ["make:backfill", "gadgets-fill", "--table", "gadgets"],
        message: "server/database/schema/gadgets.schema.ts does not exist",
        hint: "Create it first: nuxvel make:schema gadgets",
      },
      {
        args: ["make:listener", "notify", "--event", "post.published"],
        message: "server/events/post/published.event.ts does not exist",
        hint: "Create the event first: nuxvel make:event post.published",
      },
      { args: ["make:test", "../outside"], message: '"../outside" is not a valid path', hint: "Use the file's path under server/" },
      {
        args: ["make:test", "actions/posts/missing"],
        message: "server/actions/posts/missing.ts does not exist",
        hint: "make:test scaffolds a test next to an existing server file",
      },
    ];

    for (const { args, message, hint } of rejected) {
      const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, ...args);

      expect(exitCode, args.join(" ")).toBe(1);
      expect(stdout, args.join(" ")).toBe("");
      expect(stripAnsi(stderr), args.join(" ")).toContain(`✖ ${message}`);
      expect(stripAnsi(stderr), args.join(" ")).toContain(`→ ${hint}`);
    }

    expect(readdirSync(fixtureCwd).filter((entry) => entry !== "node_modules")).toEqual([]);
  }, 60000);

  it("tracks generated files and upgrade --dry-run flags hand-edited ones", async () => {
    const fixtureCwd = scratchDir("generated");

    buildNuxtFixture(fixtureCwd);

    expect((await runCliAt(fixtureCwd, "make:policy", "widget-item")).exitCode).toBe(0);

    const manifest = JSON.parse(
      readFileSync(join(fixtureCwd, ".nuxvel", "generated.json"), "utf-8"),
    );

    expect(manifest["server/policies/widget-item.policy.ts"]).toMatchObject({
      template: "policy.ts.txt",
    });
    expect(manifest["server/policies/widget-item.policy.ts"].hash).toMatch(/^[0-9a-f]{16}$/);
    expect(manifest["server/policies/widget-item.policy.ts"].templateVersion).toMatch(/^[0-9a-f]{16}$/);

    const clean = await runCliAt(fixtureCwd, "upgrade", "--dry-run");

    expect(clean.exitCode).toBe(0);
    expect(clean.stdout).toBe("");
    expect(stripAnsi(clean.stderr)).toContain("✔ No generated files were hand-edited");

    const policyFile = join(fixtureCwd, "server", "policies", "widget-item.policy.ts");
    writeFileSync(policyFile, `${readFileSync(policyFile, "utf-8")}\n`);

    const edited = await runCliAt(fixtureCwd, "upgrade", "--dry-run");

    expect(edited.exitCode).toBe(0);
    expect(edited.stdout).toBe("modified: server/policies/widget-item.policy.ts\n");
    expect(edited.stderr).toBe("");
  }, 20000);

  it("make:action writes an action skeleton and companion test bound to the domain/name", async () => {
    const fixtureCwd = scratchDir("make-action");

    buildNuxtFixture(fixtureCwd);

    const { exitCode } = await runCliAt(fixtureCwd, "make:action", "widgets/archive-widget");

    expect(exitCode).toBe(0);

    const actionFile = readFileSync(
      join(fixtureCwd, "server", "actions", "widgets", "archive-widget.action.ts"),
      "utf-8",
    );
    expect(actionFile).toContain('import { z } from "zod";');
    expect(actionFile).toContain("export const archiveWidgetAction = defineAction({");
    expect(actionFile).not.toContain("name:");
    expect(actionFile).toContain("input: z.object({}),");

    const testFile = readFileSync(
      join(fixtureCwd, "server", "actions", "widgets", "archive-widget.action.test.ts"),
      "utf-8",
    );
    expect(testFile).toContain('import { defineFactory } from "@nuxvel/nuxt/factories";');
    expect(testFile).toContain('import { expect, runAction } from "@nuxvel/nuxt/testing";');
    expect(testFile).toContain('runAction("widgets.archive-widget", {}, { actingAs: actor })');
    expect(testFile).toContain('describe("widgets/archive-widget action"');
  });

  it("make:job, make:event and make:action take fields for their Zod input and call it with sample values, and refuse unique, index and references", async () => {
    const fixtureCwd = scratchDir("make-input-fields");

    buildNuxtFixture(fixtureCwd);

    const fields = ["title", "notes:text:nullable", "count:integer:default=1", "status:enum=open,closed", "sent_at:timestamp"];
    for (const args of [
      ["make:job", "post.notify", ...fields],
      ["make:event", "post.sent", ...fields],
      ["make:action", "posts/send-post", ...fields],
    ]) {
      const { exitCode, stderr } = await runCliAt(fixtureCwd, ...args);
      expect(exitCode, stderr).toBe(0);
    }

    const read = (file: string) => readFileSync(join(fixtureCwd, "server", file), "utf-8");
    const schema = (timestamp: string) =>
      [
        "z.object({",
        "    title: z.string().trim().min(1).max(255),",
        "    notes: z.string().trim().min(1).nullish(),",
        "    count: z.number().int().default(1),",
        '    status: z.enum(["open", "closed"]),',
        `    sentAt: ${timestamp},`,
        "  }),",
      ].join("\n");
    const sample = (timestamp: string) => `{ title: "Sample text", notes: "Sample text", count: 1, status: "open", sentAt: ${timestamp} }`;

    expect(read("jobs/post/notify.job.ts")).toContain(`  input: ${schema("z.iso.datetime()")}\n`);
    expect(read("jobs/post/notify.job.test.ts")).toContain(`runJob("post.notify", ${sample('"2026-01-31T12:00:00Z"')})`);
    expect(read("events/post/sent.event.ts")).toContain(`  payload: ${schema("z.iso.datetime()")}\n`);
    expect(read("events/post/sent.event.test.ts")).toContain(`emit("post.sent", ${sample('"2026-01-31T12:00:00Z"')})`);
    expect(read("actions/posts/send-post.action.ts")).toContain(`  input: ${schema("z.date()")}\n`);
    expect(read("actions/posts/send-post.action.test.ts")).toContain(
      `runAction("posts.send-post", ${sample('new Date("2026-01-31T12:00:00Z")')}, { actingAs: actor })`,
    );

    for (const [command, name, field] of [
      ["make:job", "post.index", "slug:unique"],
      ["make:event", "post.index", "slug:index"],
      ["make:action", "posts/index-post", "author:references=user"],
    ] as const) {
      const refused = await runCliAt(fixtureCwd, command, name, field);
      const modifier = field === "slug:unique" ? "the modifier unique" : field === "slug:index" ? "the modifier index" : "the type references";

      expect(refused.exitCode).toBe(1);
      expect(stripAnsi(refused.stderr)).toContain(`✖ "${field}": ${modifier} needs a database table`);
      expect(stripAnsi(refused.stderr)).toContain("→ Remove it. Only make:schema, make:router --crud and make:resource write a table");
    }
    expect(existsSync(join(fixtureCwd, "server", "jobs", "post", "index.job.ts"))).toBe(false);
    expect(existsSync(join(fixtureCwd, "server", "events", "post", "index.event.ts"))).toBe(false);
    expect(existsSync(join(fixtureCwd, "server", "actions", "posts", "index-post.action.ts"))).toBe(false);
  }, 60000);

  it("make:job asks for a missing name in a terminal, and exits 2 with the usage hint outside one", async () => {
    const fixtureCwd = scratchDir("make-job-prompt");

    buildNuxtFixture(fixtureCwd);

    const { output, exitCode } = await runCliInTty(fixtureCwd, [["Name of the job", "post.hello-world"], ["Field 1", ""]], "make:job");

    expect(exitCode, output).toBe(0);
    expect(readFileSync(join(fixtureCwd, "server", "jobs", "post", "hello-world.job.ts"), "utf-8")).toContain("export const postHelloWorldJob = defineJob({");

    const piped = await runCliAt(fixtureCwd, "make:job");

    expect(piped.exitCode).toBe(2);
    expect(stripAnsi(piped.stderr)).toContain("✖ Missing required positional argument: NAME");
    expect(stripAnsi(piped.stderr)).toContain("→ Run nuxvel make:job --help for its usage");
  });

  it("make:schema without fields asks for them one at a time in a terminal, asks again on a bad field, and asks nothing outside one", async () => {
    const fixtureCwd = scratchDir("make-schema-fields-prompt");
    const backspace = "\x7f";

    buildServerFixture(fixtureCwd);

    const { output, exitCode } = await runCliInTty(
      fixtureCwd,
      [
        ["Field 1", "title"],
        ["Field 2", "notes:nope"],
        ['"nope" is not a known type', `${backspace.repeat(4)}text:nullable`],
        ["Field 3", "title:text"],
        ["the field title occurs two times", `${backspace.repeat(10)}priority:integer`],
        ["Field 4", ""],
      ],
      "make:schema",
      "task",
    );

    expect(exitCode, output).toBe(0);
    const schema = readFileSync(join(fixtureCwd, "server", "database", "schema", "task.schema.ts"), "utf-8");
    expect(schema).toContain('title: varchar("title", { length: 255 }).notNull(),');
    expect(schema).toContain('notes: text("notes"),');
    expect(schema).toContain('priority: integer("priority").notNull(),');

    const piped = await runCliAt(fixtureCwd, "make:schema", "tag");

    expect(piped.exitCode, piped.stderr).toBe(0);
    expect(readFileSync(join(fixtureCwd, "server", "database", "schema", "tag.schema.ts"), "utf-8")).not.toContain("title");
  });

  it("make:test asks for the kind in a terminal when the folder does not tell it", async () => {
    const fixtureCwd = scratchDir("make-test-kind-prompt");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "utils"), { recursive: true });
    writeFileSync(join(fixtureCwd, "server", "utils", "slug.ts"), "export default {};\n");

    const { output, exitCode } = await runCliInTty(fixtureCwd, [["Kind of server/utils/slug.ts to test", "jj"]], "make:test", "utils/slug");

    expect(exitCode, output).toBe(0);
    expect(readFileSync(join(fixtureCwd, "server", "utils", "slug.test.ts"), "utf-8")).toContain("with runJob()");
  });

  it("make:* reads a name with . or / between kebab-case or camelCase words as the same dotted name", async () => {
    const fixtureCwd = scratchDir("make-name-syntaxes");

    buildNuxtFixture(fixtureCwd);

    for (const name of ["post.hello-world", "post/helloWorld", "post/hello-world"]) {
      const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "make:job", name, "--force");

      expect(exitCode, stderr).toBe(0);
      expect(stripAnsi(stdout).trimEnd().split("\n"), name).toEqual([
        "✔ Created server/jobs/post/hello-world.job.ts",
        "✔ Created server/jobs/post/hello-world.job.test.ts",
      ]);
      expect(readFileSync(join(fixtureCwd, "server", "jobs", "post", "hello-world.job.ts"), "utf-8"), name).toContain(
        'export const postHelloWorldJob = defineJob({',
      );
      expect(readFileSync(join(fixtureCwd, "server", "jobs", "post", "hello-world.job.ts"), "utf-8"), name).toContain(
        'console.log("post.hello-world", input);',
      );
    }

    expect(readdirSync(join(fixtureCwd, "server", "jobs", "post")).sort()).toEqual(["hello-world.job.test.ts", "hello-world.job.ts"]);

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "make:action", "widgets.archiveWidget");

    expect(exitCode, stderr).toBe(0);
    expect(existsSync(join(fixtureCwd, "server", "actions", "widgets", "archive-widget.action.ts"))).toBe(true);
  }, 60000);

  it("make:ci writes a workflow that tests, checks and builds for the server's arch, then deploys to the environment", async () => {
    const appDir = scratchDir("make-ci");
    const workflowFile = join(appDir, ".github", "workflows", "deploy.yml");

    linkNodeModules(appDir);
    writeFileSync(join(appDir, "nuxt.config.ts"), "export default {};\n");
    writeFileSync(
      join(appDir, "nuxvel.deploy.ts"),
      `import { defineDeploy } from "@nuxvel/cli/deploy";

export default defineDeploy({
  app: "tasks",
  environments: { production: { servers: [{ host: "203.0.113.10", user: "deploy", roles: ["web"] }], arch: "arm64", domains: ["tasks.example.com"] } },
});
`,
    );

    const generated = await runCliAt(appDir, "make:ci", "production");
    expect(generated.exitCode, generated.stderr).toBe(0);
    expect(stripAnsi(generated.stdout)).toContain("✔ Created .github/workflows/deploy.yml");

    const workflow = parseYaml(readFileSync(workflowFile, "utf8"));
    const runs = (job: string) => workflow.jobs[job].steps.map((step: { run?: string }) => step.run ?? "").join("\n");

    expect(workflow.on).toEqual({ push: { branches: ["main"] } });
    expect(workflow.jobs.test.strategy.matrix.shard).toEqual([1, 2, 3]);
    expect(runs("test")).toContain("npx nuxvel test --shard=${{ matrix.shard }}/3");
    expect(runs("check")).toContain("npx nuxvel db:check");
    expect(runs("check")).toContain("npx nuxvel routes --diff-env=production");
    expect(runs("check")).toContain('npx nuxvel test:compat --against="$live"');

    const compatStep = workflow.jobs.check.steps.find((step: { name?: string }) => step.name?.startsWith("Run the tests of the live release"));
    const binDir = join(appDir, "fake-bin");
    mkdirSync(binDir);
    writeFileSync(
      join(binDir, "npx"),
      '#!/bin/sh\necho "npx $*" >> "$NPX_LOG"\n[ "$2" = releases ] || exit 0\n[ -n "$RELEASES_JSON" ] || { echo "ssh failed" >&2; exit 1; }\nprintf "%s" "$RELEASES_JSON"\n',
      { mode: 0o755 },
    );
    const runCompatStep = async (releasesJson: string) => {
      const npxLog = join(appDir, `npx-${releasesJson.length}.log`);
      writeFileSync(npxLog, "");
      const result = await execFileAsync("bash", ["-e", "-c", compatStep.run], {
        cwd: appDir,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, NPX_LOG: npxLog, RELEASES_JSON: releasesJson },
      }).then(
        ({ stdout }) => ({ exitCode: 0, stdout }),
        (error: { code: number; stdout: string }) => ({ exitCode: error.code, stdout: error.stdout }),
      );
      return { ...result, npx: readFileSync(npxLog, "utf8") };
    };
    const unreachable = await runCompatStep("");
    expect(unreachable.exitCode).not.toBe(0);
    expect(unreachable.npx).not.toContain("test:compat");
    const noLive = await runCompatStep('{"releases":[]}');
    expect(noLive.exitCode, noLive.stdout).toBe(0);
    expect(noLive.stdout).toContain("No live release with a commit");
    expect(workflow.jobs.build["runs-on"]).toBe("ubuntu-24.04-arm");
    expect(runs("build")).toContain("npx nuxvel build --artifact --platform=linux/arm64");
    expect(workflow.jobs.deploy.needs).toEqual(["test", "check", "build"]);
    expect(workflow.jobs.deploy.environment).toBe("production");
    expect(runs("deploy")).toContain('npx nuxvel deploy production --artifact="$(ls dist/*.tar.gz)"');
    expect(JSON.stringify(workflow.jobs.deploy.steps)).toContain("${{ secrets.NUXVEL_SSH_KEY }}");

    const again = await runCliAt(appDir, "make:ci", "production");
    expect(again.exitCode).toBe(1);
    expect(stripAnsi(again.stderr)).toContain("Refusing to overwrite .github/workflows/deploy.yml");

    const unknown = await runCliAt(appDir, "make:ci", "staging", "--force");
    expect(unknown.exitCode).toBe(2);
    expect(stripAnsi(unknown.stderr)).toContain("staging");
  });

  it("make:loadtest writes a k6 script that runs unmodified and requests every query procedure of the loaded router", async () => {
    const fixtureCwd = scratchPlayground("make-loadtest");
    const requested: string[] = [];
    const server = createServer((request, response) => {
      requested.push(request.url ?? "");
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });

    try {
      const generated = await runCliWithEnv(fixtureCwd, { ...bootEnv, PLAYGROUND_TEST_PROBES: "" }, "make:loadtest");
      expect(generated.exitCode, generated.stderr).toBe(0);

      const script = readFileSync(join(fixtureCwd, "tests", "load", "procedures.js"), "utf-8");
      expect(script).toContain('"post.list",');
      expect(script).not.toContain('"post.create",');

      await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
      const { port } = server.address() as AddressInfo;

      const { stdout, exitCode } = await execFileAsync("docker", [
        "run",
        "--rm",
        "--add-host=host.docker.internal:host-gateway",
        "-v",
        `${join(fixtureCwd, "tests", "load")}:/scripts`,
        "-e",
        `BASE_URL=http://host.docker.internal:${port}`,
        "grafana/k6:2.3.0",
        "run",
        "--quiet",
        "--vus",
        "1",
        "--iterations",
        "1",
        "/scripts/procedures.js",
      ]).then(
        ({ stdout }) => ({ stdout, exitCode: 0 }),
        (error: { stdout: string; stderr: string; code: number }) => ({
          stdout: `${error.stdout}${error.stderr}`,
          exitCode: error.code,
        }),
      );

      expect(exitCode, stdout).toBe(0);
      const listed = [...script.matchAll(/^ {2}"([\w.]+)",$/gm)].map((match) => `/api/trpc/${match[1]}`);
      expect(listed).toContain("/api/trpc/post.list");
      expect(requested.sort()).toEqual(listed);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 120000);

  it("make:test writes a functional test scaffold next to an existing server file, and no endpoint", async () => {
    const fixtureCwd = scratchDir("make-test");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "actions", "posts"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "server", "actions", "posts", "create-post.ts"),
      'export const createPost = defineAction({});\n',
    );

    const { exitCode } = await runCliAt(fixtureCwd, "make:test", "actions/posts/create-post");

    expect(exitCode).toBe(0);

    const testFile = readFileSync(
      join(fixtureCwd, "server", "actions", "posts", "create-post.test.ts"),
      "utf-8",
    );
    expect(testFile).toContain('describe("actions/posts/create-post"');
    expect(testFile).not.toContain("setupApp");
    expect(testFile).not.toContain("import.meta.url");
    expect(testFile).toContain("it.todo(");
    expect(testFile).not.toContain(" as ");
    expect(readdirSync(join(fixtureCwd, "server"))).toEqual(["actions"]);
  });

  it("make:test picks the action, router, job or listener scaffold from the folder or a domain folder, or from a flag", async () => {
    const fixtureCwd = scratchDir("make-test-kinds");

    buildNuxtFixture(fixtureCwd);
    for (const file of [
      "actions/posts/create-post",
      "trpc/routers/post",
      "jobs/post/notify",
      "jobs/post/notify-subscribers.job",
      "listeners/post/notify",
      "utils/slug",
      "domains/post/actions/publish.action",
      "domains/post/routers/post.router",
      "domains/order/routers/shipments.router",
      "domains/order/jobs/ship/pack.job",
    ]) {
      mkdirSync(join(fixtureCwd, "server", file, ".."), { recursive: true });
      writeFileSync(join(fixtureCwd, "server", `${file}.ts`), "export default {};\n");
    }

    const todoOf = async (...args: string[]) => {
      const { exitCode, stderr } = await runCliAt(fixtureCwd, "make:test", ...args, "--force");
      expect(exitCode, stderr).toBe(0);
      const testFile = readFileSync(join(fixtureCwd, "server", `${args[0]}.test.ts`), "utf-8");

      return testFile.match(/it\.todo\("(.*)"\)/)?.[1];
    };

    expect(await todoOf("actions/posts/create-post")).toBe(
      "runs the posts.create-post action with runAction() and checks its effect with expectRow()",
    );
    expect(await todoOf("trpc/routers/post")).toBe(
      "calls the post router through actingAs(user).trpc.post and guest().trpc.post",
    );
    expect(await todoOf("jobs/post/notify")).toBe(
      "runs the post.notify job with runJob() and checks its effect with expectRow()",
    );
    expect(await todoOf("jobs/post/notify-subscribers.job")).toBe(
      "runs the post.notify-subscribers job with runJob() and checks its effect with expectRow()",
    );
    expect(await todoOf("listeners/post/notify")).toBe(
      "runs the post.notify listener with runListener() and checks its effect with expectRow()",
    );
    expect(await todoOf("domains/post/actions/publish.action")).toBe(
      "runs the post.publish action with runAction() and checks its effect with expectRow()",
    );
    expect(await todoOf("domains/post/routers/post.router")).toBe(
      "calls the post router through actingAs(user).trpc.post and guest().trpc.post",
    );
    expect(await todoOf("domains/order/routers/shipments.router")).toBe(
      "calls the order.shipments router through actingAs(user).trpc.order.shipments and guest().trpc.order.shipments",
    );
    expect(await todoOf("domains/order/jobs/ship/pack.job")).toBe(
      "runs the order.ship.pack job with runJob() and checks its effect with expectRow()",
    );
    expect(await todoOf("utils/slug")).toContain("drives utils/slug with the fixtures");
    expect(await todoOf("utils/slug", "--job")).toBe(
      "runs the utils.slug job with runJob() and checks its effect with expectRow()",
    );

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "make:test", "utils/slug", "--job", "--action");
    expect(exitCode).toBe(2);
    expect(stripAnsi(stderr)).toContain("Pass one of --action, --job");
  });

  it("make:test --e2e writes a test that opens the page with visit() to tests/e2e/, with no server file", async () => {
    const fixtureCwd = scratchDir("make-test-e2e");

    buildNuxtFixture(fixtureCwd);

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "make:test", "posts/new", "--e2e");

    expect(exitCode, stderr).toBe(0);
    const testFile = readFileSync(join(fixtureCwd, "tests", "e2e", "posts-new.test.ts"), "utf-8");
    expect(testFile).not.toContain("setupApp");
    expect(testFile).toContain('const page = await visit({ name: "posts-new" });');
    expect(testFile).toContain('await expect(page).toHaveURL(url("/posts/new"));');
    expect(existsSync(join(fixtureCwd, "server"))).toBe(false);
  });

  it("make:router writes a thin tRPC router skeleton", async () => {
    const fixtureCwd = scratchDir("make-router");

    buildNuxtFixture(fixtureCwd);

    const { exitCode } = await runCliAt(fixtureCwd, "make:router", "widget-item");

    expect(exitCode).toBe(0);

    const routerFile = readFileSync(join(fixtureCwd, "server", "trpc", "routers", "widget-item.router.ts"), "utf-8");
    expect(routerFile).toBe("export const widgetItemRouter = {};\n");
  });

  it("make:router --crud --no-openapi writes the schema, policy, actions, and router wiring them together, with an output schema on every procedure and no REST meta", async () => {
    const fixtureCwd = scratchDir("make-router-crud");

    buildNuxtFixture(fixtureCwd);

    const { exitCode } = await runCliAt(fixtureCwd, "make:router", "widget-item", "--crud", "--no-openapi");

    expect(exitCode).toBe(0);

    const tableFile = readFileSync(join(fixtureCwd, "server", "database", "schema", "widget-item.schema.ts"), "utf-8");
    expect(tableFile).toContain('export const widgetItemTable = pgTable("widget_item", {');
    expect(tableFile).toContain('import { userTable } from "./auth.schema";');
    expect(tableFile).toContain(".references(() => userTable.id, { onDelete: \"cascade\" }),");
    expect(tableFile).toContain('ownerId: text("owner_id")');
    expect(tableFile).toContain('}, (table) => [index("widget_item_owner_id_idx").on(table.ownerId)]);');

    const policyFile = readFileSync(join(fixtureCwd, "server", "policies", "widget-item.policy.ts"), "utf-8");
    expect(policyFile).toContain("export const widgetItemPolicy = definePolicy(widgetItemTable, {");
    expect(policyFile).toContain('row.ownerId === (actor.userId ?? actor.id) || actor.role === "admin"');

    const createFile = readFileSync(
      join(fixtureCwd, "server", "actions", "widget-item", "create-widget-item.action.ts"),
      "utf-8",
    );
    expect(createFile).toContain("export const createWidgetItemAction = defineAction({");
    expect(createFile).toContain('import { widgetItemTable } from "#nuxvel/schema";');
    expect(createFile).toContain("  input: createWidgetItemInput,");
    expect(createFile).not.toContain("shared/schemas");
    expect(createFile).toContain('await audit("widget-item.created", row);');

    const updateFile = readFileSync(
      join(fixtureCwd, "server", "actions", "widget-item", "update-widget-item.action.ts"),
      "utf-8",
    );
    expect(updateFile).toContain("export const updateWidgetItemAction = defineAction({");
    expect(updateFile).toContain('await authorize(ctx.actor, "update", widgetItemTable, row);');

    const routerFile = readFileSync(join(fixtureCwd, "server", "trpc", "routers", "widget-item.router.ts"), "utf-8");
    expect(routerFile).toContain("export const widgetItemRouter = {");
    expect(routerFile).toContain(
      ".from(widgetItemTable)\n          .where(and(eq(widgetItemTable.ownerId, ctx.user.id), listWhere(widgetItemTable, input.filters)))\n          .orderBy(...listOrderBy(widgetItemTable, input.sort), desc(widgetItemTable.id))",
    );
    expect(routerFile).toContain("byId: authedProcedure\n    .input(widgetItemIdInput)\n    .output(widgetItemSchema)");
    expect(routerFile).toContain(".where(and(eq(widgetItemTable.id, input.id), eq(widgetItemTable.ownerId, ctx.user.id)))\n        .then(firstOrFail)");
    expect(routerFile).not.toContain("publicProcedure");
    expect(routerFile).toContain("    .input(widgetItemListInput)\n    .output(paginated(widgetItemSchema))\n");
    expect(routerFile).toContain("create: authedProcedure\n    .input(createWidgetItemInput)\n    .output(widgetItemSchema)");
    expect(routerFile).toContain("update: authedProcedure\n    .input(updateWidgetItemInput)\n    .output(widgetItemSchema)");
    expect(routerFile).toContain("delete: authedProcedure\n    .input(widgetItemIdInput)\n    .output(widgetItemIdInput)");
    expect(routerFile).toContain("await createWidgetItemAction(input, { actor: ctx.actor });\n      flash(\"Widget item created\");");
    expect(routerFile).toContain("await updateWidgetItemAction(input, { actor: ctx.actor });");
    expect(routerFile).not.toContain(".meta(");
    expect(routerFile).not.toContain("restore:");
    expect(policyFile).toContain("  delete: (actor, row) =>");
    expect(policyFile).not.toContain("restore:");

    const deleteFile = readFileSync(join(fixtureCwd, "server", "actions", "widget-item", "delete-widget-item.action.ts"), "utf-8");
    expect(deleteFile).toContain('await authorize(ctx.actor, "delete", widgetItemTable, row);');
    expect(deleteFile).toContain("await useDb().delete(widgetItemTable).where(eq(widgetItemTable.id, input.id));");

    const routerTest = readFileSync(join(fixtureCwd, "server", "trpc", "routers", "widget-item.router.test.ts"), "utf-8");
    expect(routerTest).toContain("await expectConstantQueries(async (size) => {");
    expect(routerTest).toContain("await actingAs(owner).trpc.widgetItem.list();");
  });

  it("make:router --crud --soft-deletes --searchable adds delete and restore, search, and REST meta with an output schema on every procedure", async () => {
    const fixtureCwd = scratchDir("make-router-crud-flags");

    buildNuxtFixture(fixtureCwd);

    const { exitCode } = await runCliAt(
      fixtureCwd,
      "make:router",
      "widget-item",
      "--crud",
      "--soft-deletes",
      "--searchable",
      "name",
    );

    expect(exitCode).toBe(0);

    const tableFile = readFileSync(join(fixtureCwd, "server", "database", "schema", "widget-item.schema.ts"), "utf-8");
    expect(tableFile).toContain('(table) => [index("widget_item_owner_id_idx").on(table.ownerId), searchIndex(table)]);');

    const policyFile = readFileSync(join(fixtureCwd, "server", "policies", "widget-item.policy.ts"), "utf-8");
    expect(policyFile).toContain("  restore: (actor, row) =>");

    const deleteFile = readFileSync(join(fixtureCwd, "server", "actions", "widget-item", "delete-widget-item.action.ts"), "utf-8");
    expect(deleteFile).toContain("await softDelete(widgetItemTable, eq(widgetItemTable.id, input.id));");

    const restoreFile = readFileSync(join(fixtureCwd, "server", "actions", "widget-item", "restore-widget-item.action.ts"), "utf-8");
    expect(restoreFile).toContain('await findOrFail(widgetItemTable, input.id, { trashed: "only" });');

    const updateFile = readFileSync(join(fixtureCwd, "server", "actions", "widget-item", "update-widget-item.action.ts"), "utf-8");
    expect(updateFile).toContain(".set(fields)");

    const routerFile = readFileSync(join(fixtureCwd, "server", "trpc", "routers", "widget-item.router.ts"), "utf-8");
    expect(routerFile).toContain(
      '.where(and(eq(widgetItemTable.ownerId, ctx.user.id), listWhere(widgetItemTable, input.filters), search(widgetItemTable, input.q ?? ""), notTrashed(widgetItemTable)))',
    );
    expect(routerFile).toContain(".where(and(eq(widgetItemTable.id, input.id), eq(widgetItemTable.ownerId, ctx.user.id), notTrashed(widgetItemTable)))");
    expect(routerFile).toContain(
      '.orderBy(...listOrderBy(widgetItemTable, input.sort), desc(searchRank(widgetItemTable, input.q ?? "")), desc(widgetItemTable.id))',
    );
    expect(routerFile).not.toContain("shared/schemas");
    expect(routerFile).toContain("    .input(widgetItemListInput)\n    .output(paginated(widgetItemSchema))\n");
    expect(routerFile).not.toContain('from "zod"');
    expect(routerFile).not.toContain(".extend(");
    expect(readFileSync(join(fixtureCwd, "shared", "schemas", "widget-item.ts"), "utf-8")).toContain(
      "  ownerId: z.string(),\n  name: z.string(),\n  createdAt: z.date(),\n  updatedAt: z.date(),\n  deletedAt: z.date().nullable(),\n});",
    );
    expect(routerFile).toContain(
      'list: authedProcedure\n    .meta({ openapi: { method: "GET", path: "/widget-item", summary: "List widget item rows", tags: ["widget-item"] } })',
    );
    expect(routerFile).toContain(
      'byId: authedProcedure\n    .meta({ openapi: { method: "GET", path: "/widget-item/{id}", summary: "Get a widget item", tags: ["widget-item"] } })\n    .input(widgetItemIdInput)\n    .output(widgetItemSchema)',
    );
    expect(routerFile).toContain(
      'create: authedProcedure\n    .meta({ openapi: { method: "POST", path: "/widget-item", summary: "Create a widget item", tags: ["widget-item"] } })\n    .input(createWidgetItemInput)\n    .output(widgetItemSchema)',
    );
    expect(routerFile).toContain(
      'update: authedProcedure\n    .meta({ openapi: { method: "PATCH", path: "/widget-item/{id}", summary: "Update a widget item", tags: ["widget-item"] } })\n    .input(updateWidgetItemInput)\n    .output(widgetItemSchema)',
    );
    expect(routerFile).toContain(
      'delete: authedProcedure\n    .meta({ openapi: { method: "DELETE", path: "/widget-item/{id}", summary: "Delete a widget item", tags: ["widget-item"] } })\n    .input(widgetItemIdInput)\n    .output(widgetItemIdInput)',
    );
    expect(routerFile).toContain(
      'restore: authedProcedure\n    .meta({ openapi: { method: "POST", path: "/widget-item/{id}/restore", summary: "Restore a widget item", tags: ["widget-item"] } })\n    .input(widgetItemIdInput)\n    .output(widgetItemSchema)',
    );
    expect(existsSync(join(fixtureCwd, "app", "pages", "widget-item"))).toBe(false);

    expect((await runCliAt(fixtureCwd, "make:router", "crate", "--crud", "--domain", "parcel")).exitCode).toBe(0);
    const domainRouter = readFileSync(join(fixtureCwd, "server", "domains", "parcel", "routers", "crate.router.ts"), "utf-8");
    expect(domainRouter).toContain('path: "/parcel/crate/{id}"');

    const withoutCrud = await runCliAt(fixtureCwd, "make:router", "gizmo", "--soft-deletes");

    expect(withoutCrud.exitCode).toBe(1);
    expect(stripAnsi(withoutCrud.stderr)).toContain("Fields, --soft-deletes and --searchable need --crud");
  });

  it("make:resource --ui writes a DataTable list page with sorting, filters and an edit modal, a new page, and the edit form, with a control and a column per field", async () => {
    const fixtureCwd = scratchDir("make-resource-ui");

    buildNuxtFixture(fixtureCwd);

    const { exitCode, stdout } = await runCliAt(
      fixtureCwd,
      "make:resource",
      "widget-item",
      "notes:text:nullable",
      "done:boolean",
      "count:integer:default=3",
      "status:enum=open,closed",
      "due_at:timestamp:nullable",
      "meta:json",
      "--searchable",
      "name",
      "--ui",
    );

    expect(exitCode).toBe(0);
    expect(stripAnsi(stdout)).toContain("Created components/WidgetItemForm.vue");

    const pagesDir = join(fixtureCwd, "pages", "widget-item");
    const list = readFileSync(join(pagesDir, "index.vue"), "utf-8");
    expect(list.startsWith('<script setup lang="ts">\ndefinePageMeta({ middleware: "auth" });\n\nconst route = useRoute();\n')).toBe(true);
    expect(list).toContain("const rows = $api.widgetItem.list.useQuery(() => input.value);");
    expect(list).toContain("const editing = $api.widgetItem.byId.useQuery(() => ({ id: editId.value ?? 0 }), {");
    expect(list).toContain(
      "const remove = $api.widgetItem.delete.useMutation({\n  optimistic: { key: () => $api.widgetItem.list.key(input.value), apply: removeRow() },\n" +
        '  confirm: { title: "Delete widget item?", confirmLabel: "Delete", color: "error" },\n});\n',
    );
    expect(list).toContain(':aria-label="`Delete widget item ${row.original.id}`"\n            @click="remove.mutate({ id: row.original.id })"');
    expect(list).toContain('search="Search widget item"');
    expect(list).toContain('<template #dueAt-cell="{ row }">\n        <DateTime v-if="row.original.dueAt" :value="row.original.dueAt" />\n      </template>\n');
    expect(list).toContain(
      ":columns=\"[{ accessorKey: 'id', header: 'ID' }, { accessorKey: 'notes', header: 'Notes' }, { accessorKey: 'done', header: 'Done' }, " +
        "{ accessorKey: 'count', header: 'Count' }, { accessorKey: 'status', header: 'Status' }, { accessorKey: 'dueAt', header: 'Due at' }, " +
        "{ accessorKey: 'name', header: 'Name' }, { id: 'actions', header: 'Actions' }]\"",
    );
    const newPage = readFileSync(join(pagesDir, "new.vue"), "utf-8");
    expect(newPage).toContain('defaults: { notes: null, done: false, count: 3, status: "open", dueAt: null, meta: {}, name: "" },');
    expect(newPage).toContain('<UFormField name="notes" label="Notes">\n        <UTextarea v-model.nullable="form.state.notes" class="w-full" />');
    expect(newPage).toContain('<UCheckbox v-model="form.state.done" />');
    expect(newPage).toContain('<UInputNumber v-model="form.state.count" class="w-full" />');
    expect(newPage).toContain('<USelect v-model="form.state.status" :items="[\'open\', \'closed\']" class="w-full" />');
    expect(newPage).toContain(
      '<ClientOnly><UInput type="datetime-local" :model-value="form.state.dueAt ? new Date(form.state.dueAt.getTime() - form.state.dueAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : \'\'" class="w-full" @update:model-value="form.state.dueAt = $event ? new Date($event) : null" /></ClientOnly>',
    );
    expect(newPage).not.toContain("form.state.meta");
    expect(newPage).toContain('<UInput v-model="form.state.name" class="w-full" />');
    expect(existsSync(join(pagesDir, "[id].vue"))).toBe(false);
    expect(list).toContain(':list="widgetItemListColumns"');
    expect(list).toContain("listQueryParams(widgetItemListInput.catch({ sort: [], filters: {} }).parse(route.query))");
    expect(list).toContain(':to="{ query: { ...route.query, edit: row.original.id } }"');
    expect(list).toContain(`<UButton :to="{ name: 'widget-item-new' }"`);
    expect(newPage).toContain('await navigateTo({ name: "widget-item" });');
    expect(list).toContain('<WidgetItemForm :key="data.id" :row="data" @saved="closeEdit" />');
    expect(newPage).toContain("(list) => list && { ...list, rows: [created, ...list.rows], total: list.total + 1 },");
    expect(newPage).not.toContain("invalidateQueries");
    const form = readFileSync(join(fixtureCwd, "components", "WidgetItemForm.vue"), "utf-8");
    expect(form).toContain(
      "defaults: { id: props.row.id, notes: props.row.notes, done: props.row.done, count: props.row.count, status: props.row.status, dueAt: props.row.dueAt, name: props.row.name },",
    );
    expect(form).toContain("(list) => list && { ...list, rows: list.rows.map((row) => (row.id === saved.id ? saved : row)) },");
    expect(form).not.toContain("navigateTo");
    expect(form).not.toContain("invalidateQueries");
    expect(readFileSync(join(fixtureCwd, "shared", "schemas", "widget-item.ts"), "utf-8")).toContain(
      "export const widgetItemListColumns = {\n" +
        '  sort: ["id", "notes", "done", "count", "status", "dueAt", "name", "createdAt", "updatedAt"],\n' +
        '  filters: {\n    notes: "text",\n    done: "boolean",\n    status: ["open", "closed"],\n    dueAt: "dateRange",\n  },\n' +
        "} as const;\n\nexport const widgetItemListInput = listQuery(widgetItemListColumns);\n",
    );
  });

  it("make:resource with fields writes them into the schema, and the generated test sends a sample value for each", async () => {
    const fixtureCwd = scratchDir("make-resource-fields");

    buildServerFixture(fixtureCwd);
    writeFileSync(join(fixtureCwd, "package.json"), '{ "type": "module" }\n');

    expect((await runCliAt(fixtureCwd, "make:router", "project", "--crud", "code:uuid", "name")).exitCode).toBe(0);

    const { exitCode, stderr } = await runCliAt(
      fixtureCwd,
      "make:resource",
      "task",
      "title",
      "status:enum=draft,done:default=draft",
      "due_at:timestamp",
      "project:references",
      "reviewer:references=user:nullable",
      "--ui",
    );

    expect(exitCode, stderr).toBe(0);
    const newPage = readFileSync(join(fixtureCwd, "pages", "task", "new.vue"), "utf-8");
    const projectList = "const projectList = $api.project.list.useQuery({ perPage: 100 });\n";
    expect(newPage).toContain(projectList);
    expect(newPage).toContain('projectId: undefined, reviewerId: null');
    expect(newPage).toContain('<USelect v-model="form.state.projectId" :items="projectList.data?.rows" value-key="id" label-key="name" class="w-full" />');
    expect(newPage).toContain('<UInput v-model.nullable="form.state.reviewerId" class="w-full" />');
    expect(newPage).toContain('@update:model-value="form.state.dueAt = new Date($event)" /></ClientOnly>');
    expect(readFileSync(join(fixtureCwd, "components", "TaskForm.vue"), "utf-8")).toContain(projectList);
    expect(readFileSync(join(fixtureCwd, "shared", "schemas", "task.ts"), "utf-8")).toContain(
      '  status: z.enum(["draft", "done"]).optional(),\n',
    );
    expect(readFileSync(join(fixtureCwd, "server", "actions", "task", "update-task.action.ts"), "utf-8")).toContain(
      "if (Object.keys(fields).length === 0) return row;",
    );
    const createTask = readFileSync(join(fixtureCwd, "server", "actions", "task", "create-task.action.ts"), "utf-8");
    expect(createTask).toContain('import { projectTable } from "#nuxvel/schema";\n');
    expect(createTask).toContain(
      "    await useDb()\n      .select()\n      .from(projectTable)\n      .where(and(eq(projectTable.id, input.projectId), eq(projectTable.ownerId, ctx.actor.userId ?? ctx.actor.id)))\n      .then(firstOrFail);\n\n    const row",
    );
    expect(createTask).not.toContain("userTable");
    expect(readFileSync(join(fixtureCwd, "server", "actions", "task", "update-task.action.ts"), "utf-8")).toContain(
      "    if (fields.projectId && fields.projectId !== row.projectId) {\n",
    );

    const testFile = readFileSync(join(fixtureCwd, "server", "trpc", "routers", "task.router.test.ts"), "utf-8");
    expect(testFile).toContain('import { projectTable } from "#nuxvel/schema";\n');
    expect(testFile).toContain(
      "const projectFactory = defineFactory(projectTable, {\n  ownerId: async () => (await userFactory()).id,\n});\n",
    );
    expect(testFile).toContain(
      [
        "  ownerId: async () => (await userFactory()).id,",
        '  title: "Sample text",',
        '  status: "draft",',
        '  dueAt: new Date("2026-01-31T12:00:00Z"),',
        "  projectId: async () => (await projectFactory()).id,",
        "  reviewerId: async () => (await userFactory()).id,",
        "});",
      ].join("\n"),
    );
    expect(testFile).toContain(
      'owner.task.create({ title: "Sample text", status: "draft", dueAt: new Date("2026-01-31T12:00:00Z"), projectId: (await projectFactory({ ownerId: user.id })).id, reviewerId: (await userFactory()).id })',
    );
    expect(testFile).toContain("owner.task.update({ id: created.id });");

    const withoutCrud = await runCliAt(fixtureCwd, "make:router", "gizmo", "title");

    expect(withoutCrud.exitCode).toBe(1);
    expect(stripAnsi(withoutCrud.stderr)).toContain("Fields, --soft-deletes and --searchable need --crud");

    expect((await runCliAt(fixtureCwd, "make:schema", "milestone", "project:references")).exitCode).toBe(0);
    const unfillable = await runCliAt(fixtureCwd, "make:resource", "deliverable", "milestone:references");

    expect(unfillable.exitCode).toBe(1);
    expect(stripAnsi(unfillable.stderr)).toContain("The test cannot make a row of milestoneTable: it needs a value for project_id");
    expect(stripAnsi(unfillable.stderr)).toContain("→ Create a factory for that table first with nuxvel make:factory");
  }, 60000);

  it("upgrade --dry-run names a malformed or unparsable .nuxvel/generated.json instead of crashing", async () => {
    const fixtureCwd = scratchDir("malformed-manifest");
    const manifest = join(fixtureCwd, ".nuxvel", "generated.json");

    mkdirSync(join(fixtureCwd, ".nuxvel"));
    writeFileSync(manifest, JSON.stringify({ "server/jobs/tick.ts": { template: "job.ts.txt" } }));

    const malformed = await runCliAt(fixtureCwd, "upgrade", "--dry-run");

    expect(malformed.exitCode).toBe(1);
    expect(malformed.stderr).toContain(`${manifest} is malformed`);
    expect(malformed.stderr).toContain("the entry for server/jobs/tick.ts is not");
    expect(stripAnsi(malformed.stderr)).toContain("→ It must map each generated file to its template");
    expect(malformed.stderr).not.toContain("    at ");

    writeFileSync(manifest, "{ not json");

    const unparsable = await runCliAt(fixtureCwd, "upgrade", "--dry-run");

    expect(unparsable.exitCode).toBe(1);
    expect(unparsable.stderr).toContain(`${manifest} is not valid JSON`);
    expect(stripAnsi(unparsable.stderr)).toContain("→ Fix the file, or delete it");
  });

  it("a generator prints why nuxt prepare failed and exits non-zero", async () => {
    const appDir = scratchPlayground("make-prepare-fails");

    writeFileSync(
      join(appDir, "nuxt.config.ts"),
      'export default defineNuxtConfig({ modules: [() => { throw new Error("nuxt.config is broken on purpose"); }] });\n',
    );

    const { stderr, exitCode } = await runCliAt(appDir, "make:task", "reindex-posts");

    expect(exitCode).toBe(1);
    expect(stderr).toContain("nuxt prepare exited with code 1");
    expect(stderr).toContain("nuxt.config is broken on purpose");
  }, 30000);

  it("make:job writes into the app's serverDir, with a test next to it", async () => {
    const fixtureCwd = scratchDir("make-server-dir");

    linkNodeModules(fixtureCwd);
    writeFileSync(join(fixtureCwd, "nuxt.config.ts"), 'export default defineNuxtConfig({ serverDir: "backend" });\n');

    const { stdout, stderr, exitCode } = await runCliWithEnv(
      fixtureCwd,
      { ...process.env, CI: "1" },
      "make:job",
      "post.notify-subscribers",
    );

    expect(exitCode, stderr).toBe(0);
    expect(stripAnsi(stdout).trimEnd().split("\n")).toEqual([
      "✔ Created backend/jobs/post/notify-subscribers.job.ts",
      "✔ Created backend/jobs/post/notify-subscribers.job.test.ts",
    ]);
    expect(stripAnsi(stderr)).toMatch(/^◇ Updated types \(nuxt prepare\) \(\d/m);
    expect(stderr).not.toContain("\r");
    expect(existsSync(join(fixtureCwd, "backend", "jobs", "post", "notify-subscribers.job.ts"))).toBe(true);
    expect(existsSync(join(fixtureCwd, "server"))).toBe(false);
    expect(readFileSync(join(fixtureCwd, "backend", "jobs", "post", "notify-subscribers.job.test.ts"), "utf-8")).toContain(
      'describe("post.notify-subscribers job"',
    );
  }, 60000);

  it("make:notification writes a database-channel notification and its test, from a custom template when the app has one", async () => {
    const fixtureCwd = scratchDir("make-notification");

    buildNuxtFixture(fixtureCwd);

    const created = await runCliAt(fixtureCwd, "make:notification", "post.published");
    const definition = readFileSync(join(fixtureCwd, "server", "notifications", "post", "published.notification.ts"), "utf8");
    const test = readFileSync(join(fixtureCwd, "server", "notifications", "post", "published.notification.test.ts"), "utf8");

    expect(created.exitCode, created.stderr).toBe(0);
    expect(definition).toContain("export const postPublishedNotification = defineNotification({");
    expect(definition).toContain('via: ["database"],');
    expect(definition).toContain('toDatabase: ({ message }) => ({ title: "Post published", body: message }),');
    expect(test).toContain('import { userTable } from "#nuxvel/schema";');
    expect(test).toContain('await sendNotification(recipient, "post.published", { message: "Hello" });');

    const rejected = await runCliAt(fixtureCwd, "make:notification", "Post.published");

    expect(rejected.exitCode).toBe(1);
    expect(stripAnsi(rejected.stderr)).toContain('"Post.published" is not a valid name');

    mkdirSync(join(fixtureCwd, ".nuxvel", "templates"), { recursive: true });
    writeFileSync(join(fixtureCwd, ".nuxvel", "templates", "notification.ts.txt"), "// {{name}}: {{title}}\n");

    const custom = await runCliAt(fixtureCwd, "make:notification", "comment.replied");

    expect(custom.exitCode, custom.stderr).toBe(0);
    expect(readFileSync(join(fixtureCwd, "server", "notifications", "comment", "replied.notification.ts"), "utf8")).toBe(
      "// comment.replied: Comment replied\n",
    );
    rmSync(join(fixtureCwd, ".nuxvel", "templates", "notification.ts.txt"));

    const inDomain = await runCliAt(fixtureCwd, "make:notification", "shipped", "--domain", "order");
    const domainDir = join(fixtureCwd, "server", "domains", "order", "notifications");

    expect(inDomain.exitCode, inDomain.stderr).toBe(0);
    expect(readFileSync(join(domainDir, "shipped.notification.ts"), "utf8")).toContain(
      "export const orderShippedNotification = defineNotification({",
    );
    expect(readFileSync(join(domainDir, "shipped.notification.test.ts"), "utf8")).toContain(
      'import { userTable } from "#nuxvel/schema";',
    );

    const badDomain = await runCliAt(fixtureCwd, "make:notification", "shipped", "--domain", "Order");

    expect(badDomain.exitCode).toBe(1);
    expect(stripAnsi(badDomain.stderr)).toContain('"Order" is not a valid name');

    const noModule = await runCliAt(fixtureCwd, "make:notification", "shipped", "--module", "billing");

    expect(noModule.exitCode).toBe(1);
    expect(stripAnsi(noModule.stderr)).toContain("layers/billing/nuxt.config.ts does not exist");
    expect(stripAnsi(noModule.stderr)).toContain("nuxvel make:module billing");
  }, 60000);

  it("make:backfill --domain finds the schema in the domain folder", async () => {
    const fixtureCwd = scratchDir("make-backfill-domain");

    buildNuxtFixture(fixtureCwd);

    expect((await runCliAt(fixtureCwd, "make:schema", "link", "--domain", "link")).exitCode).toBe(0);

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "make:backfill", "fill-slugs", "--table", "link", "--domain", "link");

    expect(exitCode, stderr).toBe(0);
    expect(readFileSync(join(fixtureCwd, "server", "domains", "link", "backfills", "fill-slugs.backfill.ts"), "utf8")).toContain(
      'from "#nuxvel/schema"',
    );
  });

  it("make:schema references finds the table in another domain or a module, and refuses two matches", async () => {
    const fixtureCwd = scratchDir("make-schema-reference-search");

    buildNuxtFixture(fixtureCwd);
    writeFileSync(join(fixtureCwd, "package.json"), '{ "type": "module" }\n');
    writeFileSync(join(fixtureCwd, "package.json"), '{ "type": "module" }\n');

    expect((await runCliAt(fixtureCwd, "make:schema", "course", "--domain", "catalog")).exitCode).toBe(0);

    const inDomain = await runCliAt(fixtureCwd, "make:schema", "enrollment", "course:references", "--domain", "learning");

    expect(inDomain.exitCode, inDomain.stderr).toBe(0);
    expect(readFileSync(join(fixtureCwd, "server", "domains", "learning", "schema", "enrollment.schema.ts"), "utf8")).toContain(
      "courseTable.id",
    );

    expect((await runCliAt(fixtureCwd, "make:module", "billing")).exitCode).toBe(0);
    expect((await runCliAt(fixtureCwd, "make:schema", "invoice", "--module", "billing")).exitCode).toBe(0);

    const inModule = await runCliAt(fixtureCwd, "make:schema", "payment", "invoice:references");

    expect(inModule.exitCode, inModule.stderr).toBe(0);

    expect((await runCliAt(fixtureCwd, "make:schema", "invoice", "--domain", "sales")).exitCode).toBe(0);

    const twice = await runCliAt(fixtureCwd, "make:schema", "refund", "invoice:references");

    expect(twice.exitCode).toBe(1);
    expect(stripAnsi(twice.stderr)).toContain("The table invoice is in more than one place");
  }, 120000);

  it("make:listener --module finds an event of the app and of another module", async () => {
    const fixtureCwd = scratchDir("make-listener-module-events");

    buildNuxtFixture(fixtureCwd);

    expect((await runCliAt(fixtureCwd, "make:module", "billing")).exitCode).toBe(0);
    expect((await runCliAt(fixtureCwd, "make:module", "crm")).exitCode).toBe(0);
    expect((await runCliAt(fixtureCwd, "make:event", "post.published")).exitCode).toBe(0);
    expect((await runCliAt(fixtureCwd, "make:event", "lead.created", "--module", "crm")).exitCode).toBe(0);

    const fromApp = await runCliAt(fixtureCwd, "make:listener", "notify", "--event", "post.published", "--module", "billing");
    const fromModule = await runCliAt(fixtureCwd, "make:listener", "welcome", "--event", "lead.created", "--module", "billing");

    expect(fromApp.exitCode, fromApp.stderr).toBe(0);
    expect(fromModule.exitCode, fromModule.stderr).toBe(0);
    expect(readFileSync(join(fixtureCwd, "layers", "billing", "server", "listeners", "welcome.listener.ts"), "utf8")).toContain(
      "leadCreatedEvent",
    );
  }, 120000);

  it("make:factory --module fills the factory it writes in the module", async () => {
    const fixtureCwd = scratchDir("make-factory-module");

    buildNuxtFixture(fixtureCwd);
    writeFileSync(join(fixtureCwd, "package.json"), '{ "type": "module" }\n');
    writeFileSync(join(fixtureCwd, "package.json"), '{ "type": "module" }\n');

    expect((await runCliAt(fixtureCwd, "make:module", "billing")).exitCode).toBe(0);
    expect((await runCliAt(fixtureCwd, "make:schema", "invoice", "number:string", "--module", "billing")).exitCode).toBe(0);

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "make:factory", "invoice", "--module", "billing");

    expect(exitCode, stderr).toBe(0);
    expect(readFileSync(join(fixtureCwd, "layers", "billing", "server", "factories", "invoice.factory.ts"), "utf8")).toContain("number:");
  }, 120000);

  it("make:page --module writes under layers/<module>/app/pages/", async () => {
    const fixtureCwd = scratchDir("make-page-module");

    buildNuxtFixture(fixtureCwd);

    expect((await runCliAt(fixtureCwd, "make:module", "billing")).exitCode).toBe(0);

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "make:page", "invoices", "--module", "billing");

    expect(exitCode, stderr).toBe(0);
    expect(existsSync(join(fixtureCwd, "layers", "billing", "app", "pages", "invoices.vue"))).toBe(true);
    expect(existsSync(join(fixtureCwd, "layers", "billing", "pages"))).toBe(false);
  });

  it("make:resource --domain writes the files into the domain folder, with the privacy file importing the table from it", async () => {
    const fixtureCwd = scratchDir("make-resource-domain");

    buildNuxtFixture(fixtureCwd);

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "make:resource", "crate", "--domain", "parcel");
    const domain = join(fixtureCwd, "server", "domains", "parcel");

    expect(exitCode, stderr).toBe(0);
    expect(existsSync(join(domain, "schema", "crate.schema.ts"))).toBe(true);
    expect(existsSync(join(domain, "routers", "crate.router.ts"))).toBe(true);
    expect(existsSync(join(fixtureCwd, "server", "database", "schema", "crate.schema.ts"))).toBe(false);
    expect(readFileSync(join(fixtureCwd, "server", "privacy", "crate.user-data.ts"), "utf8")).toContain(
      'from "#nuxvel/schema"',
    );
  });

  it("make:page writes the Nuxt page template itself and refuses to overwrite without --force", async () => {
    const fixtureCwd = scratchDir("make-page");
    const pageFile = join(fixtureCwd, "pages", "blog", "index.vue");
    const page = [
      '<script setup lang="ts"></script>',
      "",
      "<template>",
      "  <div>",
      "    Page: blog/index",
      "  </div>",
      "</template>",
      "",
      "<style scoped></style>",
      "",
    ].join("\n");

    buildNuxtFixture(fixtureCwd);

    const created = await runCliAt(fixtureCwd, "make:page", "blog/index");

    expect(created.exitCode, created.stderr).toBe(0);
    expect(stripAnsi(created.stdout)).toBe("✔ Created pages/blog/index.vue\n");
    expect(created.stderr).not.toContain("Deprecated");
    expect(readFileSync(pageFile, "utf8")).toBe(page);

    writeFileSync(pageFile, "hand written\n");

    const refused = await runCliAt(fixtureCwd, "make:page", "blog/index");

    expect(refused.exitCode).toBe(1);
    expect(stripAnsi(refused.stderr)).toContain("✖ Refusing to overwrite pages/blog/index.vue");
    expect(stripAnsi(refused.stderr)).toContain("→ Pass --force to overwrite");
    expect(readFileSync(pageFile, "utf8")).toBe("hand written\n");

    const forced = await runCliAt(fixtureCwd, "make:page", "blog/index", "--force");

    expect(forced.exitCode, forced.stderr).toBe(0);
    expect(readFileSync(pageFile, "utf8")).toBe(page);

    mkdirSync(join(fixtureCwd, ".nuxvel", "templates"), { recursive: true });
    writeFileSync(join(fixtureCwd, ".nuxvel", "templates", "page.vue.txt"), "<template>{{name}}</template>\n");

    const custom = await runCliAt(fixtureCwd, "make:page", "about");

    expect(custom.exitCode, custom.stderr).toBe(0);
    expect(readFileSync(join(fixtureCwd, "pages", "about.vue"), "utf8")).toBe("<template>about</template>\n");
  }, 30000);

  it("make:story writes a story next to an existing component and refuses a missing component or an existing story", async () => {
    const fixtureCwd = scratchDir("make-story");
    const storyFile = join(fixtureCwd, "app", "components", "base", "icon-button.stories.ts");

    cpSync(join(playgroundDir, "nuxt.config.ts"), join(fixtureCwd, "nuxt.config.ts"));
    mkdirSync(join(fixtureCwd, "app", "components", "base"), { recursive: true });

    const missing = await runCliAt(fixtureCwd, "make:story", "base/icon-button");

    expect(missing.exitCode).toBe(1);
    expect(stripAnsi(missing.stderr)).toContain("✖ app/components/base/icon-button.vue does not exist");
    expect(stripAnsi(missing.stderr)).toContain("→ Pass the path of a component under app/components/, without .vue, e.g. base/Button");
    expect(existsSync(storyFile)).toBe(false);

    writeFileSync(
      join(fixtureCwd, "app", "components", "base", "icon-button.vue"),
      '<script setup lang="ts">\ndefineProps<{ label: string }>();\n</script>\n\n<template><button>{{ label }}</button></template>\n',
    );

    const created = await runCliAt(fixtureCwd, "make:story", "base/icon-button");

    expect(created.exitCode, created.stderr).toBe(0);
    expect(stripAnsi(created.stdout)).toBe("✔ Created app/components/base/icon-button.stories.ts\n");
    expect(readFileSync(storyFile, "utf8")).toBe(
      [
        'import type { Meta, StoryObj } from "@storybook-vue/nuxt";',
        'import { expect } from "@nuxvel/nuxt/storybook/test";',
        'import IconButton from "./icon-button.vue";',
        "",
        "const meta = { component: IconButton } satisfies Meta<typeof IconButton>;",
        "export default meta;",
        "",
        "export const Default: StoryObj<typeof IconButton> = {",
        "  play: async ({ canvasElement }) => {",
        "    await expect(canvasElement).not.toBeEmptyDOMElement();",
        "  },",
        "};",
        "",
      ].join("\n"),
    );

    const refused = await runCliAt(fixtureCwd, "make:story", "base/icon-button");

    expect(refused.exitCode).toBe(1);
    expect(stripAnsi(refused.stderr)).toContain("✖ Refusing to overwrite app/components/base/icon-button.stories.ts");

    writeFileSync(
      join(fixtureCwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, target: "ESNext", lib: ["ESNext", "DOM", "DOM.Iterable"], module: "preserve", moduleResolution: "bundler", skipLibCheck: true, noEmit: true, types: [] },
        include: ["app"],
      }),
    );
    const typecheck = await runBinAt(fixtureCwd, "vue-tsc", ["-p", "tsconfig.json"]);

    expect(typecheck.exitCode, `${typecheck.stdout}${typecheck.stderr}`).toBe(0);
  }, 60000);

  it("factory:sync appends metadata-derived values to a suffixed factory for a column that became required, reading the factory's keys from its syntax tree", async () => {
    const fixtureCwd = scratchDir("factory-sync");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "database", "schema"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "factories"), { recursive: true });

    writeFileSync(
      join(fixtureCwd, "server", "database", "schema", "widget.schema.ts"),
      [
        'import { pgTable, serial, text } from "drizzle-orm/pg-core";',
        "",
        'export const widget = pgTable("widget", {',
        '  id: serial("id").primaryKey(),',
        '  title: text("title").notNull(),',
        '  slug: text("slug").notNull(),',
        "});",
        "",
      ].join("\n"),
    );

    const factoryPath = join(fixtureCwd, "server", "factories", "widget.factory.ts");
    writeFileSync(
      factoryPath,
      [
        'import { defineFactory } from "@nuxvel/nuxt/factories";',
        'import { widget } from "../database/schema/widget.schema";',
        "",
        "export const widgetFactory = defineFactory(widget, {",
        '  title: "Hand written",',
        "  // slug: comes from factory:sync",
        "});",
        "",
      ].join("\n"),
    );

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "factory:sync", "widget");

    expect(exitCode).toBe(0);
    expect(stdout).toBe("widget.factory.ts: added slug\n");

    const synced = readFileSync(factoryPath, "utf-8");
    expect(synced).toMatch(/^import { faker } from "@faker-js\/faker";\n/);
    expect(synced).toContain('  title: "Hand written",');
    expect(synced).toContain("  slug: () => faker.lorem.slug(),");

    const second = await runCliAt(fixtureCwd, "factory:sync");

    expect(second.exitCode).toBe(0);
    expect(second.stdout).toBe("");
    expect(stripAnsi(second.stderr)).toContain("✔ All factories are up to date");
    expect(readFileSync(factoryPath, "utf-8")).toBe(synced);

    const domainFactoryPath = join(fixtureCwd, "server", "domains", "shop", "factories", "widget.factory.ts");
    mkdirSync(dirname(domainFactoryPath), { recursive: true });
    writeFileSync(
      domainFactoryPath,
      [
        'import { defineFactory } from "@nuxvel/nuxt/factories";',
        'import { widget } from "../../../database/schema/widget.schema";',
        "",
        'export const shopWidgetFactory = defineFactory(widget, { title: "Domain" });',
        "",
      ].join("\n"),
    );

    const domain = await runCliAt(fixtureCwd, "factory:sync");

    expect(domain.exitCode).toBe(0);
    expect(domain.stdout).toBe("domains/shop/factories/widget.factory.ts: added slug\n");

    const missing = await runCliAt(fixtureCwd, "factory:sync", "gizmo");

    expect(missing.exitCode).toBe(1);
    expect(stripAnsi(missing.stderr)).toContain('No factory named "gizmo"');
  });

  it("factory:sync finds the table a factory imports from #nuxvel/schema among the schema files", async () => {
    const fixtureCwd = scratchDir("factory-sync-alias");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "database", "schema"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "factories"), { recursive: true });

    for (const table of ["gadget", "widget"]) {
      writeFileSync(
        join(fixtureCwd, "server", "database", "schema", `${table}.schema.ts`),
        [
          'import { pgTable, serial, text } from "drizzle-orm/pg-core";',
          "",
          `export const ${table} = pgTable("${table}", {`,
          '  id: serial("id").primaryKey(),',
          '  slug: text("slug").notNull(),',
          "});",
          "",
        ].join("\n"),
      );
    }

    const factoryPath = join(fixtureCwd, "server", "factories", "widget.factory.ts");
    writeFileSync(
      factoryPath,
      [
        'import { defineFactory } from "@nuxvel/nuxt/factories";',
        'import { widget } from "#nuxvel/schema";',
        "",
        "export const widgetFactory = defineFactory(widget);",
        "",
      ].join("\n"),
    );

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "factory:sync", "widget");

    expect(exitCode).toBe(0);
    expect(stdout).toBe("widget.factory.ts: added slug\n");
    expect(readFileSync(factoryPath, "utf-8")).toContain("  slug: () => faker.lorem.slug(),");
  });

  it("factory:sync writes sanitizeHtml for a SanitizedHtml column and the scratch app typechecks", async () => {
    const fixtureCwd = scratchDir("factory-sync-sanitized");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "database", "schema"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "factories"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "server", "database", "schema", "post.schema.ts"),
      [
        'import { pgTable, serial, text } from "drizzle-orm/pg-core";',
        'import type { SanitizedHtml } from "@nuxvel/nuxt/factories";',
        "",
        'export const post = pgTable("post", {',
        '  id: serial("id").primaryKey(),',
        '  body: text("body").$type<SanitizedHtml>().notNull(),',
        "});",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(fixtureCwd, "server", "factories", "post.factory.ts"),
      [
        'import { defineFactory } from "@nuxvel/nuxt/factories";',
        'import { post } from "../database/schema/post.schema";',
        "",
        "export const postFactory = defineFactory(post);",
        "",
      ].join("\n"),
    );

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "factory:sync", "post");

    expect(exitCode, stderr).toBe(0);

    const synced = readFileSync(join(fixtureCwd, "server", "factories", "post.factory.ts"), "utf-8");
    expect(synced).toContain('import { sanitizeHtml } from "@nuxvel/nuxt/factories";');
    expect(synced).toContain("  body: () => sanitizeHtml(faker.lorem.paragraph()),");

    writeFileSync(
      join(fixtureCwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noUncheckedIndexedAccess: true, target: "ESNext", lib: ["ESNext", "DOM"], module: "preserve", moduleResolution: "bundler", skipLibCheck: true, noEmit: true, types: [], paths: { "#nuxvel/schema": ["./server/database/schema/post.schema.ts"] } },
        include: ["server"],
      }),
    );
    const typecheck = await runBinAt(fixtureCwd, "vue-tsc", ["-p", "tsconfig.json"]);

    expect(typecheck.exitCode, `${typecheck.stdout}${typecheck.stderr}`).toBe(0);
  }, 60000);

  it("factory:sync adds a separating comma to a one-line factory and refreshes its generated.json entry", async () => {
    const fixtureCwd = scratchDir("factory-sync-comma");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "database", "schema"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "factories"), { recursive: true });
    mkdirSync(join(fixtureCwd, ".nuxvel"), { recursive: true });

    writeFileSync(
      join(fixtureCwd, "server", "database", "schema", "widget.ts"),
      [
        'import { boolean, integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";',
        "",
        'export const widget = pgTable("widget", {',
        '  id: serial("id").primaryKey(),',
        '  title: text("title").notNull(),',
        '  slug: text("slug").notNull(),',
        '  rank: integer("rank").notNull(),',
        '  live: boolean("live").notNull(),',
        '  seenAt: timestamp("seen_at").notNull(),',
        '  token: uuid("token").notNull(),',
        "});",
        "",
      ].join("\n"),
    );

    const factoryPath = join(fixtureCwd, "server", "factories", "widget.ts");
    const original = [
      'import { defineFactory } from "@nuxvel/nuxt/factories";',
      'import { widget } from "../database/schema/widget";',
      "",
      'export const widgetFactory = defineFactory(widget, { title: "Hand written" });',
      "",
    ].join("\n");
    writeFileSync(factoryPath, original);
    writeFileSync(
      join(fixtureCwd, ".nuxvel", "generated.json"),
      JSON.stringify({
        "server/factories/widget.ts": {
          template: "factory.ts.txt",
          templateVersion: "0000000000000000",
          hash: createHash("sha256").update(original).digest("hex").slice(0, 16),
        },
      }),
    );

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "factory:sync", "widget");

    expect(exitCode, stdout).toBe(0);
    expect(stdout).toContain("widget.ts: added slug, rank, live, seenAt, token");

    const synced = readFileSync(factoryPath, "utf-8");
    expect(synced.match(/import { faker } from "@faker-js\/faker";/g)).toHaveLength(1);
    expect(synced).toContain('{ title: "Hand written",\n  slug: () => faker.lorem.slug(),');
    expect(synced).toContain(
      "  rank: () => faker.number.int({ min: 1, max: 1000 }),\n  live: () => faker.datatype.boolean(),\n  seenAt: () => faker.date.recent(),\n  token: () => crypto.randomUUID(),\n});",
    );
    expect(() => transformSync(synced, { loader: "ts" })).not.toThrow();

    const upgrade = await runCliAt(fixtureCwd, "upgrade", "--dry-run");
    expect(upgrade.stderr).toContain("No generated files were hand-edited");

    writeFileSync(join(fixtureCwd, "package.json"), '{ "type": "module" }\n');
    writeFileSync(
      join(fixtureCwd, "server", "database", "schema", "part.ts"),
      [
        'import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";',
        'import { widget } from "./widget";',
        "",
        'export const part = pgTable("part", {',
        '  id: serial("id").primaryKey(),',
        '  widgetId: integer("widget_id").notNull().references(() => widget.id),',
        '  spareId: integer("spare_id").references(() => widget.id),',
        '  label: text("label").notNull(),',
        "});",
        "",
      ].join("\n"),
    );
    const partPath = join(fixtureCwd, "server", "factories", "part.factory.ts");
    writeFileSync(
      partPath,
      [
        'import { defineFactory } from "@nuxvel/nuxt/factories";',
        'import { part } from "../database/schema/part";',
        "",
        "export const partFactory = defineFactory(part);",
        "",
      ].join("\n"),
    );

    const foreign = await runCliAt(fixtureCwd, "factory:sync", "part");

    expect(foreign.exitCode, foreign.stderr).toBe(0);
    expect(foreign.stdout).toBe("part.factory.ts: added widgetId, label\n");

    const part = readFileSync(partPath, "utf-8");
    expect(part).toMatch(/^import { faker } from "@faker-js\/faker";\nimport { widgetFactory } from ".\/widget";\n/);
    expect(part).toContain("  widgetId: async () => (await widgetFactory()).id,\n  label: () => faker.lorem.words(),\n});");
    expect(() => transformSync(part, { loader: "ts" })).not.toThrow();
  });
});
