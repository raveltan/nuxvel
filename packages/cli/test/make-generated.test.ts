import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runAppTests } from "./helpers/app.ts";
import { bootEnv } from "./helpers/fixtures.ts";
import { runBinAt, runCliAt, runCliWithEnv } from "./helpers/run.ts";
import { sharedPlayground } from "./helpers/scratch.ts";

type AppTestFile = {
  name: string;
  status: string;
  message: string;
  assertionResults: { fullName: string; failureMessages: string[] }[];
};

const appDir = sharedPlayground("make-generated");
const migrationsDir = join(appDir, "server", "database", "migrations");
const reportFile = join(appDir, "app-tests.json");

const inputFields = [
  "label",
  "notes:text:nullable",
  "contact:email",
  "count:integer:default=1",
  "views:bigint",
  "active:boolean",
  "price:decimal=8,2",
  "code:uuid",
  "due_on:date",
  "sent_at:timestamp",
  "meta:json",
  "status:enum=open,closed:default=open",
];

const generators: string[][] = [
  ["make:job", "shipment.weigh", ...inputFields],
  ["make:event", "shipment.weighed", ...inputFields],
  ["make:listener", "shipment.log-weight", "--event", "shipment.weighed"],
  ["make:action", "widgets/weigh-widget", ...inputFields],
  ["make:action", "widgets/archive-widget"],
  ["make:backfill", "posts.fill-slugs", "--table", "posts"],
  ["make:job", "shipment.notify-subscribers"],
  ["make:mail", "shipment.shipped"],
  ["make:notification", "shipment.delivered"],
  ["make:webhook", "shipment.carrier"],
  ["make:channel", "shipment.updates"],
  ["make:factory", "flag-exposures"],
  ["make:event", "shipment.published"],
  ["make:listener", "shipment.notify", "--event", "shipment.published"],
  ["make:action", "cancel-parcel", "--domain", "parcel"],
  ["make:job", "notify-courier", "--domain", "parcel"],
  ["make:event", "dispatched", "--domain", "parcel"],
  ["make:listener", "log-dispatch", "--event", "parcel.dispatched", "--domain", "parcel"],
  ["make:schema", "courier", "--domain", "parcel"],
  ["make:schema", "depot", "--domain", "depot"],
  ["make:factory", "courier", "--domain", "parcel"],
  ["make:policy", "courier", "--domain", "parcel"],
  ["make:policy", "depot", "--domain", "depot"],
  ["make:router", "crate", "--crud", "--domain", "parcel"],
  ["make:test", "actions/posts/create-post.action"],
  ["make:test", "jobs/post/notify-followers.job", "--force"],
  ["make:test", "trpc/routers/post.router", "--force"],
  ["make:test", "sign-in", "--e2e"],
  ["make:router", "widget-item", "--crud"],
  ["make:resource", "invoice"],
  ["make:resource", "article", "--soft-deletes", "--searchable", "title,body", "--ui"],
  ["make:router", "gadget"],
  ["make:schema", "widget"],
  [
    "make:schema",
    "shelf",
    "label",
    "notes:text:nullable",
    "contact:email:unique",
    "capacity:integer:default=10",
    "views:bigint",
    "active:boolean:default=true",
    "price:decimal=8,2",
    "code:uuid",
    "opened_on:date:index",
    "checked_at:timestamp:nullable",
    "meta:json",
    "status:enum=open,closed:default=open",
    "widget:references",
    "keeper:references=user:nullable",
  ],
  ["make:schema", "rack", "label", "widget:references"],
  ["make:factory", "widget"],
  ["make:factory", "rack"],
  ["make:factory", "shelf"],
  ["make:resource", "bin", "rack:references"],
  ["make:resource", "receipt", "invoice:references"],
  [
    "make:resource",
    "ledger",
    "title",
    "notes:text:nullable",
    "contact:email:unique",
    "entries:integer:default=0",
    "views:bigint",
    "active:boolean",
    "balance:decimal=8,2",
    "code:uuid",
    "opened_on:date",
    "closed_at:timestamp:nullable",
    "starts_at:timestamp",
    "meta:json",
    "status:enum=open,closed:default=open",
    "widget:references",
    "invoice:references",
    "keeper:references=user:nullable",
    "rank:integer:nullable",
    "flagged:boolean:nullable",
    "tier:enum=gold,silver:nullable",
    "--ui",
  ],
  ["make:module", "shipping"],
  ["make:job", "charge", "--module", "shipping", "--domain", "payment"],
  ["make:notification", "shipment.returned", "--module", "shipping"],
];

const crudSpec = `import { defineFactory } from "@nuxvel/nuxt/factories";
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userTable } from "../../server/database/schema/auth.schema";

const userFactory = defineFactory(userTable);

describe("make:router --crud (widget-item)", () => {
  it("lists, creates, and updates through the api caller, enforcing authorization", async () => {
    const owner = actingAs(await userFactory()).api;

    const created = await owner.widgetItem.create({});
    const listed = await owner.widgetItem.list();
    const updated = await owner.widgetItem.update({ id: created.id });

    expect(listed.rows.map((row) => row.id)).toContain(created.id);
    expect(updated.id).toBe(created.id);
    await expect(
      actingAs(await userFactory()).api.widgetItem.update({ id: created.id }),
    ).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("gives a row created with an API key to the user of the key", async () => {
    const user = await userFactory();
    const created = await actingAs(user, { apiKey: true }).api.widgetItem.create({});

    expect(created.ownerId).toBe(user.id);
    await expect(actingAs(user, { apiKey: true }).api.widgetItem.update({ id: created.id })).resolves.toMatchObject({ id: created.id });
  });

  it("shows a row to its owner only", async () => {
    const owner = actingAs(await userFactory()).api;
    const stranger = actingAs(await userFactory()).api;
    const created = await owner.widgetItem.create({});

    expect((await stranger.widgetItem.list()).rows).toEqual([]);
    await expect(stranger.widgetItem.byId({ id: created.id })).rejects.toBeTrpcError("NOT_FOUND");
    await expect(guest().api.widgetItem.list()).rejects.toBeTrpcError("UNAUTHORIZED");
    await expect(guest().api.widgetItem.byId({ id: created.id })).rejects.toBeTrpcError("UNAUTHORIZED");
  });
});
`;

const receiptSpec = `import { defineFactory } from "@nuxvel/nuxt/factories";
import { actingAs, expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userTable } from "../../server/database/schema/auth.schema";
import { invoiceTable } from "../../server/database/schema/invoice.schema";

const userFactory = defineFactory(userTable);
const invoiceFactory = defineFactory(invoiceTable, {
  ownerId: async () => (await userFactory()).id,
});

describe("make:resource with a reference to an owned table", () => {
  it("writes a row only under a parent row of the same user", async () => {
    const user = await userFactory();
    const owner = actingAs(user).api;
    const mine = await invoiceFactory({ ownerId: user.id });
    const theirs = await invoiceFactory();

    await expect(owner.receipt.create({ invoiceId: theirs.id })).rejects.toBeTrpcError("NOT_FOUND");
    const created = await owner.receipt.create({ invoiceId: mine.id });
    await expect(owner.receipt.update({ id: created.id, invoiceId: theirs.id })).rejects.toBeTrpcError("NOT_FOUND");
    expect(await owner.receipt.update({ id: created.id, invoiceId: mine.id })).toMatchObject({ invoiceId: mine.id });
    const byKey = await actingAs(user, { apiKey: true }).api.receipt.create({ invoiceId: mine.id });
    expect(byKey).toMatchObject({ invoiceId: mine.id, ownerId: user.id });
  });
});
`;

const articleListSpec = `import { defineFactory } from "@nuxvel/nuxt/factories";
import { actingAs, alert, button, cell, dialog, expect, field } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { articleTable } from "../../server/database/schema/article.schema";
import { userTable } from "../../server/database/schema/auth.schema";

const userFactory = defineFactory(userTable);
const articleFactory = defineFactory(articleTable, {
  ownerId: async () => (await userFactory()).id,
});

describe("the generated article list in a browser", () => {
  it("hides a deleted row at once, and shows it again when the delete fails", async () => {
    const user = await userFactory();
    const article = await articleFactory({ ownerId: user.id });
    const page = await actingAs(user).visit("/article", { allowFailedRequests: ["**/api/trpc/article.delete**"] });

    let releaseDelete = () => {};
    const deleteHeld = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    await page.route("**/api/trpc/article.delete**", async (route) => {
      await deleteHeld;
      await route.abort();
    });

    const deleteButton = button(page, \`Delete article \${article.id}\`);
    await deleteButton.click();
    await button(dialog(page), "Delete").click();
    await expect(deleteButton).toHaveCount(0);

    releaseDelete();
    await expect(deleteButton).toBeVisible();
    await expect(alert(page)).toBeVisible();
  });

  it("sorts by two columns from the headers and keeps the sort in the URL", async () => {
    const user = await userFactory();
    const first = await articleFactory({ ownerId: user.id, title: "Alpha", body: "2" });
    const second = await articleFactory({ ownerId: user.id, title: "Alpha", body: "1" });
    const third = await articleFactory({ ownerId: user.id, title: "Beta", body: "0" });
    const page = await actingAs(user).visit("/article");

    await button(page, "Sort by Title").click();
    await expect(page).toHaveURL((address) => address.searchParams.get("sort") === "title:asc");
    await button(page, "Sort by Body").click({ modifiers: ["Shift"] });
    await expect(page).toHaveURL((address) => address.searchParams.get("sort") === "title:asc,body:asc");
    await expect(page.locator("tbody tr td:first-child")).toHaveText([String(second.id), String(first.id), String(third.id)]);

    const reloaded = await actingAs(user).visit("/article?sort=title:asc,body:asc");
    await expect(button(reloaded, "Body, sorted ascending")).toBeVisible();
  });

  it("opens the edit form in a modal from ?edit=, closes it on save, and reports an ID that does not exist", async () => {
    const owner = await userFactory();
    const article = await articleFactory({ ownerId: owner.id, title: "Draft" });
    const page = await actingAs(owner).visit(\`/article?edit=\${article.id}\`);

    await field(dialog(page), "Title").fill("Final");
    await button(dialog(page), "Save article").click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page).toHaveURL((address) => address.pathname === "/article" && address.search === "");
    await expect(cell(page, "Final")).toBeVisible();

    const missing = await actingAs(owner).visit("/article?edit=999999");
    await expect(alert(missing)).toContainText("Could not open the article.");
    await expect(missing).toHaveURL((address) => address.pathname === "/article" && address.search === "");
  });
});
`;

const rowSchemaProbe = `import type { z } from "zod";
import type { ArticleRow } from "./database/schema/article.schema";
import type { LedgerRow } from "./database/schema/ledger.schema";
import type { ShelfRow } from "./database/schema/shelf.schema";
import { articleSchema } from "../shared/schemas/article";
import { ledgerSchema } from "../shared/schemas/ledger";
import { shelfSchema } from "../shared/schemas/shelf";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const rowSchemaProbe: [
  Equal<z.infer<typeof shelfSchema>, ShelfRow>,
  Equal<z.infer<typeof ledgerSchema>, LedgerRow>,
  Equal<z.infer<typeof articleSchema>, Omit<ArticleRow, "searchVector">>,
] = [true, true, true];
`;

const sqlFiles = () => readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
const source = (file: string) => readFileSync(join(appDir, file), "utf-8");

describe("nuxvel make:* output running in an app", () => {
  let migrationsBefore: string[] = [];
  const generated: Record<string, { stdout: string; stderr: string; exitCode: number }> = {};
  let typecheck: { stdout: string; stderr: string; exitCode: number };
  let appTests: { stdout: string; exitCode: number };
  let results: AppTestFile[] = [];
  let openapi: { stdout: string; stderr: string; exitCode: number };
  let arch: { stdout: string; stderr: string; exitCode: number };

  beforeAll(async () => {
    migrationsBefore = sqlFiles();

    for (const args of generators) generated[args.join(" ")] = await runCliAt(appDir, ...args);
    generated["db:generate"] = await runCliAt(appDir, "db:generate");

    mkdirSync(join(appDir, "server", "privacy"), { recursive: true });
    writeFileSync(
      join(appDir, "server", "privacy", "shelf.user-data.ts"),
      'import { shelfTable } from "#nuxvel/schema";\n\nexport const shelfUserData = defineUserData(shelfTable, shelfTable.keeperId);\n',
    );
    arch = await runCliWithEnv(appDir, { ...process.env, PLAYGROUND_TEST_PROBES: "" }, "test:arch");

    mkdirSync(join(appDir, "tests", "functional"), { recursive: true });
    writeFileSync(join(appDir, "tests", "functional", "widget-item.test.ts"), crudSpec);
    writeFileSync(join(appDir, "tests", "functional", "receipt.test.ts"), receiptSpec);
    mkdirSync(join(appDir, "tests", "e2e"), { recursive: true });
    writeFileSync(join(appDir, "tests", "e2e", "article-list.test.ts"), articleListSpec);
    writeFileSync(
      join(appDir, "server", "_fields-probe.ts"),
      'import type { NewShelfRow } from "./database/schema/shelf.schema";\nimport { createShelfInput } from "../shared/schemas/shelf";\n\nexport const fieldsProbe = (input: unknown): NewShelfRow => createShelfInput.parse(input);\n',
    );
    writeFileSync(join(appDir, "server", "_row-schema-probe.ts"), rowSchemaProbe);
    writeFileSync(
      join(appDir, "server", "_prepare-probe.ts"),
      'import type { WidgetRow } from "./database/schema/widget.schema";\n\nexport const probe: WidgetRow | undefined = undefined;\n',
    );

    [appTests, typecheck] = await Promise.all([
      runAppTests(appDir, ["--reporter=default", "--reporter=json", `--outputFile.json=${reportFile}`]),
      runBinAt(appDir, "vue-tsc", ["-b", "--noEmit"]),
    ]);
    results = (JSON.parse(readFileSync(reportFile, "utf-8")) as { testResults: AppTestFile[] }).testResults;
    openapi = await runCliWithEnv(appDir, bootEnv, "openapi:export");
  }, 600000);

  function expectAppTestPassed(file: string) {
    const result = results.find((candidate) => candidate.name === join(appDir, file));

    expect(result, `${file} did not run:\n${appTests.stdout}`).toBeDefined();
    const failures = (result?.assertionResults ?? []).flatMap((assertion) =>
      assertion.failureMessages.map((failure) => `${assertion.fullName}: ${failure}`),
    );
    const why = failures.length > 0 ? failures.join("\n") : `${result?.message}\n${appTests.stdout}`;
    expect(result?.status, why).toBe("passed");
  }

  it("runs every generator and db:generate cleanly", () => {
    for (const [command, result] of Object.entries(generated)) {
      expect(result.exitCode, `${command}\n${result.stdout}${result.stderr}`).toBe(0);
    }
    expect(sqlFiles()).toHaveLength(migrationsBefore.length + 1);
  });

  it("typechecks the app with every generated file in it, .nuxt types refreshed by the generators alone", () => {
    expect(typecheck.exitCode, `${typecheck.stdout}${typecheck.stderr}`).toBe(0);
  });

  it("builds the app once for the whole run, and starts it for every test file without a setup call in the file", () => {
    const sources = results.map((file) => readFileSync(file.name, "utf-8"));

    expect(appTests.stdout.match(/◇ (Built the app for tests|Using the test build from)/g), appTests.stdout).toHaveLength(1);
    for (const text of sources) expect(text).not.toMatch(/\bsetup(App)?\(/);
    expectAppTestPassed("tests/functional/widget-item.test.ts");
    expectAppTestPassed("tests/e2e/sign-in.test.ts");
  });

  it("make:resource and make:router --crud write the user data declaration, so test:arch passes", () => {
    expect(source("server/privacy/invoice.user-data.ts")).toBe(
      'import { invoiceTable } from "#nuxvel/schema";\n\nexport const invoiceUserData = defineUserData(invoiceTable, invoiceTable.ownerId);\n',
    );
    expect(source("server/privacy/widget-item.user-data.ts")).toContain("defineUserData(widgetItemTable, widgetItemTable.ownerId)");
    expect(source("server/privacy/crate.user-data.ts")).toContain(
      'from "#nuxvel/schema"',
    );
    expect(arch.exitCode, `${arch.stdout}${arch.stderr}`).toBe(0);
  });

  it("make:resource writes create and update actions that refuse a parent row of another user", () => {
    expectAppTestPassed("tests/functional/receipt.test.ts");
    expectAppTestPassed("server/trpc/routers/receipt.router.test.ts");
  });

  it("make:schema's table lands in the migration db:generate writes", () => {
    const migration = sqlFiles().find((name) => !migrationsBefore.includes(name)) ?? "";
    const migrationSql = readFileSync(join(migrationsDir, migration), "utf-8");

    expect(migrationSql).toContain('CREATE TABLE "widget"');
    expect(migrationSql).toContain('"id" serial PRIMARY KEY NOT NULL');
    expect(migrationSql).toContain('"created_at" timestamp DEFAULT now() NOT NULL');
    expect(migrationSql).toContain('"updated_at" timestamp DEFAULT now() NOT NULL');
    expect(migrationSql).toContain('CREATE INDEX "widget_item_owner_id_idx" ON "widget_item" USING btree ("owner_id");');
    expect(migrationSql).toContain('CREATE INDEX "invoice_owner_id_idx" ON "invoice" USING btree ("owner_id");');
  });

  it("make:schema with fields writes columns, foreign keys and indexes that db:generate turns into SQL", () => {
    const migration = sqlFiles().find((name) => !migrationsBefore.includes(name)) ?? "";
    const migrationSql = readFileSync(join(migrationsDir, migration), "utf-8");

    for (const column of [
      '"label" varchar(255) NOT NULL',
      '"notes" text,',
      '"contact" varchar(255) NOT NULL',
      '"capacity" integer DEFAULT 10 NOT NULL',
      '"views" bigint NOT NULL',
      '"active" boolean DEFAULT true NOT NULL',
      '"price" numeric(8, 2) NOT NULL',
      '"code" uuid NOT NULL',
      '"opened_on" date NOT NULL',
      '"checked_at" timestamp,',
      '"meta" jsonb NOT NULL',
      "\"status\" text DEFAULT 'open' NOT NULL",
      '"widget_id" integer NOT NULL',
      '"keeper_id" text,',
      'CONSTRAINT "shelf_contact_unique" UNIQUE("contact")',
      'FOREIGN KEY ("widget_id") REFERENCES "public"."widget"("id") ON DELETE cascade',
      'FOREIGN KEY ("keeper_id") REFERENCES "public"."user"("id") ON DELETE set null',
      'CREATE INDEX "shelf_opened_on_idx" ON "shelf" USING btree ("opened_on");',
      'CREATE INDEX "shelf_widget_id_idx" ON "shelf" USING btree ("widget_id");',
    ]) {
      expect(migrationSql).toContain(column);
    }
  });

  it("make:module writes an empty layer that the app extends and typechecks with", () => {
    expect(source("layers/shipping/nuxt.config.ts")).toBe("export default defineNuxtConfig({});\n");
    expect(typecheck.exitCode, `${typecheck.stdout}${typecheck.stderr}`).toBe(0);
  });

  it("make:* --module writes into layers/<module>/, with --domain too, and imports the app's auth schema from the root", () => {
    const module = "layers/shipping/server";

    expect(source(`${module}/domains/payment/jobs/charge.job.ts`)).toContain("export const paymentChargeJob = defineJob({");
    expect(source(`${module}/notifications/shipment/returned.notification.test.ts`)).toContain(
      'import { userTable } from "#nuxvel/schema";',
    );
    expectAppTestPassed(`${module}/domains/payment/jobs/charge.job.test.ts`);
    expectAppTestPassed(`${module}/notifications/shipment/returned.notification.test.ts`);
  });

  it("make:action's generated test passes unmodified against the generated action", () => {
    expectAppTestPassed("server/actions/widgets/archive-widget.action.test.ts");
  });

  it("make:* --domain writes into server/domains/<domain>/, named after the domain, with tests that pass unmodified", () => {
    const domain = "server/domains/parcel";

    expect(source(`${domain}/actions/cancel-parcel.action.ts`)).toContain("export const cancelParcelAction = defineAction(");
    expect(source(`${domain}/jobs/notify-courier.job.ts`)).toContain("export const parcelNotifyCourierJob = defineJob({");
    expect(source(`${domain}/listeners/log-dispatch.listener.ts`)).toContain(
      'import { parcelDispatchedEvent } from "#server/domains/parcel/events/dispatched.event";',
    );
    expect(source(`${domain}/factories/courier.factory.ts`)).toContain('import { courierTable } from "#nuxvel/schema";');
    expect(source(`${domain}/policies/courier.policy.ts`)).toContain('import { courierTable } from "#nuxvel/schema";');
    expect(source(`${domain}/policies/courier.policy.ts`)).toContain("export const parcelCourierPolicy = definePolicy(");
    expect(source("server/domains/depot/policies/depot.policy.ts")).toContain("export const depotPolicy = definePolicy(");
    expect(source(`${domain}/routers/crate.router.ts`)).toContain('import { createCrateAction } from "#server/domains/parcel/actions/create-crate.action";');
    expect(source(`${domain}/routers/crate.router.ts`)).toContain("export const parcelCrateRouter = {");
    expect(source(`${domain}/actions/update-crate.action.ts`)).toContain('import { crateTable } from "#nuxvel/schema";');
    expect(source(`${domain}/routers/crate.router.test.ts`)).toContain("actingAs(owner).api.parcel.crate.list()");

    for (const file of [
      "actions/cancel-parcel.action.test.ts",
      "jobs/notify-courier.job.test.ts",
      "events/dispatched.event.test.ts",
      "listeners/log-dispatch.listener.test.ts",
      "factories/courier.factory.test.ts",
      "routers/crate.router.test.ts",
    ]) {
      expectAppTestPassed(`${domain}/${file}`);
    }
  });

  it("make:backfill's generated test passes unmodified against the generated backfill", () => {
    const backfill = source("server/database/backfills/posts/fill-slugs.backfill.ts");

    expect(backfill).toContain('import { postsTable } from "#nuxvel/schema";');
    expect(backfill).toContain("export const postsFillSlugsBackfill = defineBackfill({");
    expect(backfill).not.toContain("name:");
    expect(backfill).toContain("table: postsTable,");
    expectAppTestPassed("server/database/backfills/posts/fill-slugs.backfill.test.ts");
  });

  it("make:job, make:mail, make:notification, make:webhook, make:channel and make:factory write files whose generated tests pass unmodified", () => {
    expect(source("server/jobs/shipment/notify-subscribers.job.ts")).toContain("export const shipmentNotifySubscribersJob = defineJob({");
    expect(source("server/jobs/shipment/notify-subscribers.job.ts")).not.toContain("name:");
    expect(source("server/mail/shipment/shipped.mail.ts")).toContain("export const shipmentShippedMail = defineMail({");
    expect(source("server/channels/shipment/updates.channel.ts")).toContain("export const shipmentUpdatesChannel = defineChannel({");
    expect(source("server/channels/shipment/updates.channel.ts")).not.toContain("authorize");
    expect(source("server/channels/shipment/updates.channel.test.ts")).toContain('guest().listen("shipment.updates")).rejects.toBeTrpcError("FORBIDDEN")');
    expect(source("server/notifications/shipment/delivered.notification.ts")).toContain(
      "export const shipmentDeliveredNotification = defineNotification({",
    );
    expect(source("server/mail/shipment/shipped.mail.ts")).toContain(
      'template: "ShipmentShipped",',
    );
    expect(source("server/webhooks/shipment/carrier.webhook.ts")).toContain('secret: "NUXT_SHIPMENT_CARRIER_WEBHOOK_SECRET"');
    expect(source("server/webhooks/shipment/carrier.webhook.test.ts")).toContain('deliverWebhook("shipment.carrier"');
    expect(source("server/webhooks/shipment/carrier.webhook.test.ts")).not.toContain("createHmac");
    expect(source("server/factories/flag-exposures.factory.ts")).toBe(
      [
        'import { faker } from "@faker-js/faker";',
        'import { defineFactory } from "@nuxvel/nuxt/factories";',
        'import { flagExposuresTable } from "#nuxvel/schema";',
        "",
        "export const flagExposuresFactory = defineFactory(flagExposuresTable, {",
        "  name: () => faker.person.fullName(),",
        "  unitId: () => faker.lorem.words(),",
        "  variant: () => faker.lorem.words(),",
        "});",
        "",
      ].join("\n"),
    );

    for (const file of [
      "server/jobs/shipment/notify-subscribers.job.test.ts",
      "server/mail/shipment/shipped.mail.test.ts",
      "server/webhooks/shipment/carrier.webhook.test.ts",
      "server/channels/shipment/updates.channel.test.ts",
      "server/notifications/shipment/delivered.notification.test.ts",
      "server/factories/flag-exposures.factory.test.ts",
      "server/factories/shelf.factory.test.ts",
    ]) {
      expectAppTestPassed(file);
    }
  });

  it("make:webhook's eventId and handler read fields of the payload typed by its schema, and the app typechecks", () => {
    const webhook = source("server/webhooks/shipment/carrier.webhook.ts");

    expect(webhook).toContain("export const shipmentCarrierWebhook = defineWebhook({");

    expect(webhook).toContain("payload: z.object({ id: z.string(), type: z.string() }),");
    expect(webhook).toContain("eventId: ({ payload }) => payload.id,");
    expect(webhook).toContain('console.log("shipment.carrier", payload.type, payload.id);');
    expect(webhook).not.toContain("safeParse");
    expect(typecheck.exitCode, `${typecheck.stdout}${typecheck.stderr}`).toBe(0);
  });

  it("make:job, make:event, make:listener and make:action with fields write tests that pass with a sample value for each field", () => {
    expect(source("server/jobs/shipment/weigh.job.ts")).toContain("    sentAt: z.iso.datetime(),\n");
    expect(source("server/actions/widgets/weigh-widget.action.ts")).toContain("    sentAt: z.date(),\n");
    expectAppTestPassed("server/jobs/shipment/weigh.job.test.ts");
    expectAppTestPassed("server/events/shipment/weighed.event.test.ts");
    expectAppTestPassed("server/listeners/shipment/log-weight.listener.test.ts");
    expectAppTestPassed("server/actions/widgets/weigh-widget.action.test.ts");
  });

  it("make:event and make:listener write files whose generated tests pass unmodified", () => {
    expect(source("server/events/shipment/published.event.ts")).toContain("export const shipmentPublishedEvent = defineEvent({");
    expect(source("server/events/shipment/published.event.ts")).not.toContain("name:");
    expect(source("server/listeners/shipment/notify.listener.ts")).toContain(
      'import { shipmentPublishedEvent } from "#server/events/shipment/published.event";',
    );
    expect(source("server/listeners/shipment/notify.listener.ts")).toContain("export const shipmentNotifyListener = defineListener({");
    expectAppTestPassed("server/events/shipment/published.event.test.ts");
    expectAppTestPassed("server/listeners/shipment/notify.listener.test.ts");
  });

  it("make:test's generated scaffold runs and passes trivially against a real target file", () => {
    expect(source("server/actions/posts/create-post.action.test.ts")).not.toContain("health/live");
    expectAppTestPassed("server/actions/posts/create-post.action.test.ts");
  });

  it("make:test's job and router scaffolds run and pass against real target files", () => {
    expect(source("server/jobs/post/notify-followers.job.test.ts")).toContain("runJob()");
    expect(source("server/trpc/routers/post.router.test.ts")).toContain("actingAs(user).api.post");
    expectAppTestPassed("server/jobs/post/notify-followers.job.test.ts");
    expectAppTestPassed("server/trpc/routers/post.router.test.ts");
  });

  it("make:router --crud generates a router that lists, creates, and updates through the in-process caller, with authorization enforced", () => {
    expectAppTestPassed("tests/functional/widget-item.test.ts");
  });

  it("make:router --crud and make:resource generate a constant-query test for the list procedure that passes unmodified", () => {
    expect(source("server/trpc/routers/widget-item.router.test.ts")).toContain("expectConstantQueries");
    expect(source("server/trpc/routers/invoice.router.test.ts")).toContain("expectConstantQueries");
    expectAppTestPassed("server/trpc/routers/widget-item.router.test.ts");
  });

  it("make:resource composes schema, policy, actions, and router into one command, and its generated test passes unmodified", () => {
    expect(source("server/trpc/routers/invoice.router.ts")).toContain(".input(invoiceListInput)");
    const spec = source("server/trpc/routers/invoice.router.test.ts");
    for (const title of ["creates a row for its owner", "updates a row for its owner", "refuses to update the row of another user"]) {
      expect(spec).toContain(`it("${title}"`);
    }
    expectAppTestPassed("server/trpc/routers/invoice.router.test.ts");
  });

  it("make:resource with fields writes a resource whose generated test passes with a sample value for each field, and whose --ui form typechecks", () => {
    expect(source("server/trpc/routers/ledger.router.ts")).toContain(".output(ledgerSchema)");
    expect(source("server/trpc/routers/ledger.router.test.ts")).toContain('balance: "1.5"');
    expect(source("server/trpc/routers/ledger.router.test.ts")).toContain("  invoiceId: async () => (await invoiceFactory()).id,\n");
    expectAppTestPassed("server/trpc/routers/ledger.router.test.ts");
    expect(source("app/components/LedgerForm.vue")).toContain('<USelect v-model="form.state.invoiceId" :items="invoiceList.data?.rows" value-key="id" label-key="id" class="w-full" />');
    expect(source("app/components/LedgerForm.vue")).toContain('<UInputNumber v-model="form.state.widgetId" class="w-full" />');
    expect(source("app/pages/(app)/ledger/new.vue")).toContain("widgetId: undefined, invoiceId: undefined, keeperId: null");
    expect(typecheck.exitCode, `${typecheck.stdout}${typecheck.stderr}`).toBe(0);
  });

  it("make:resource reuses the app factory of a referenced table, so a required reference of that table gets a real row", () => {
    const test = source("server/trpc/routers/bin.router.test.ts");

    expect(test).toContain('import { rackFactory } from "#nuxvel/factories";\n');
    expect(test).not.toContain("defineFactory(rackTable");
    expect(source("server/factories/rack.factory.ts")).toContain("  widgetId: async () => (await widgetFactory()).id,\n");
    expectAppTestPassed("server/trpc/routers/bin.router.test.ts");
  });

  it("make:resource and make:router --crud put every generated procedure in the OpenAPI document", () => {
    expect(openapi.exitCode, openapi.stderr).toBe(0);
    const paths = (JSON.parse(openapi.stdout) as { paths: Record<string, Record<string, unknown>> }).paths;
    const methods = (path: string) => Object.keys(paths[path] ?? {}).sort();

    expect(methods("/article")).toEqual(["get", "post"]);
    expect(methods("/article/{id}")).toEqual(["delete", "get", "patch"]);
    expect(methods("/article/{id}/restore")).toEqual(["post"]);
    expect(methods("/invoice/{id}")).toEqual(["delete", "get", "patch"]);
    expect(methods("/ledger/{id}")).toEqual(["delete", "get", "patch"]);
    expect(methods("/widget-item")).toEqual(["get", "post"]);
    expect(methods("/parcel/crate/{id}")).toEqual(["delete", "get", "patch"]);
  });

  it("make:resource --soft-deletes --searchable --ui writes a resource whose search, delete and restore tests pass, and whose pages typecheck", () => {
    expect(source("server/trpc/routers/article.router.ts")).toContain(
      '.where(and(eq(articleTable.ownerId, ctx.user.id), listWhere(articleTable, input.filters), search(articleTable, input.q ?? ""), notTrashed(articleTable)))',
    );
    expect(source("app/pages/(app)/article/index.vue")).toContain("<DataTable");
    expect(source("app/pages/(app)/article/index.vue")).toContain("const remove = $api.article.delete.useMutation({");
    expect(source("app/pages/(app)/article/index.vue")).toContain("<UModal");
    expect(source("app/components/ArticleForm.vue")).toContain("useActionForm($api.article.update");
    expectAppTestPassed("server/trpc/routers/article.router.test.ts");
    expect(typecheck.exitCode, `${typecheck.stdout}${typecheck.stderr}`).toBe(0);
  });

  it("make:resource --ui writes a list whose Delete hides the row before the server answers and shows it again when the delete fails, that sorts by two columns, and that edits in a ?edit= modal", () => {
    expectAppTestPassed("tests/e2e/article-list.test.ts");
  });

  it("make:resource without --soft-deletes writes a hard delete that only the owner may run, and its generated test passes", () => {
    expect(source("server/actions/invoice/delete-invoice.action.ts")).toContain("await useDb().delete(invoiceTable)");
    expect(source("server/trpc/routers/invoice.router.test.ts")).toContain('.delete({ id: row.id })).rejects.toBeTrpcError("FORBIDDEN")');
    expectAppTestPassed("server/trpc/routers/invoice.router.test.ts");
  });
});
