import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const runJobModule = fileURLToPath(new URL("../../src/runtime/server/testing/run-job", import.meta.url));
const actorContextModule = fileURLToPath(new URL("../../src/runtime/server/actions/context", import.meta.url));

function write(appDir: string, path: string, contents: string) {
  mkdirSync(dirname(join(appDir, path)), { recursive: true });
  writeFileSync(join(appDir, path), contents);
}

export function addDomainFolders(appDir: string) {
  write(appDir, "server/utils/domain-runs.ts", "export const domainRuns: string[] = [];\n");
  write(
    appDir,
    "server/domains/order/jobs/ship/pack.job.ts",
    `import { z } from "zod";

export const orderShipPackJob = defineJob({
  input: z.object({ note: z.string() }),
  handler: async ({ note }) => {
    domainRuns.push(note);
  },
});
`,
  );
  write(
    appDir,
    "server/domains/order/actions/place.action.ts",
    `import { z } from "zod";

export const placeAction = defineAction({
  input: z.object({ item: z.string() }),
  handler: ({ item }) => \`placed \${item}\`,
});
`,
  );
  write(
    appDir,
    "server/domains/order/schema/shipments.schema.ts",
    `import { pgTable, serial } from "drizzle-orm/pg-core";

export const shipmentsTable = pgTable("shipments", {
  id: serial("id").primaryKey(),
});
`,
  );
  write(
    appDir,
    "server/domains/order/factories/shipment.factory.ts",
    `import { defineFactory } from "@nuxvel/nuxt/factories";
import { shipmentsTable } from "../schema/shipments.schema";

export const shipmentFactory = defineFactory(shipmentsTable, {});
`,
  );
  write(
    appDir,
    "server/domains/order/policies/shipment.policy.ts",
    `import { shipmentsTable } from "../schema/shipments.schema";

export const orderShipmentPolicy = definePolicy(shipmentsTable, {
  view: (actor) => actor.id === "domain-actor",
});
`,
  );
  write(
    appDir,
    "server/domains/order/routers/shipments.router.ts",
    `export const shipmentsRouter = {
  count: publicProcedure.query(() => 3),
};
`,
  );
  write(
    appDir,
    "server/domains/invoice/schema/invoices.schema.ts",
    `import { pgTable, serial } from "drizzle-orm/pg-core";

export const invoicesTable = pgTable("domain_invoices", {
  id: serial("id").primaryKey(),
});
`,
  );
  write(
    appDir,
    "server/domains/invoice/policies/invoice.policy.ts",
    `import { invoicesTable } from "../schema/invoices.schema";

export const invoicePolicy = definePolicy(invoicesTable, {
  view: (actor) => actor.id === "domain-actor",
});
`,
  );
  write(
    appDir,
    "server/domains/invoice/routers/invoice.router.ts",
    `export const invoiceRouter = {
  total: publicProcedure.query(() => 7),
};
`,
  );
  write(
    appDir,
    "server/domains/order/mail/templates/OrderShipped.vue",
    `<script setup lang="ts">
defineProps<{ item: string }>();
</script>

<template>
  <MailLayout><EText>Shipped {{ item }}</EText></MailLayout>
</template>
`,
  );
  write(
    appDir,
    "server/domains/order/mail/shipped.mail.ts",
    `import { z } from "zod";

export const shippedMail = defineMail({
  input: z.object({ to: z.email(), item: z.string() }),
  subject: () => "Shipped",
  template: "OrderShipped",
});
`,
  );
  write(
    appDir,
    "server/api/_domain-mail-check.get.ts",
    'export default defineEventHandler(() => $mails.order.shipped.render({ to: "ada@example.com", item: "lamp" }));\n',
  );
  write(
    appDir,
    "server/api/_domain-kinds-check.get.ts",
    `import * as factories from "#nuxvel/factories";
import * as schema from "#nuxvel/schema";
import { actorContext } from "${relative(join(appDir, "server/api"), actorContextModule)}";

const asUser = <T>(id: string, run: () => Promise<T>) => actorContext.run({ type: "user", id }, run);

export default defineEventHandler(async () => ({
  tables: Object.keys(schema),
  factories: Object.keys(factories),
  canView: await asUser("domain-actor", () => can($policies.order.shipment.view, { id: 1 })),
  otherCanView: await asUser("other", () => can($policies.order.shipment.view, { id: 1 })),
  canViewInvoice: await asUser("domain-actor", () => can($policies.invoice.view, { id: 1 })),
}));
`,
  );
  write(
    appDir,
    "server/api/_domain-folders-check.get.ts",
    `import jobs from "#nuxvel/jobs";
import { runJob } from "${relative(join(appDir, "server/api"), runJobModule)}";

export default defineEventHandler(async () => {
  await runJob($jobs.order.ship.pack.name, { note: "packed" });

  return {
    jobNames: jobs.map((job) => job.name),
    ran: domainRuns,
    placed: await $actions.order.place({ item: "lamp" }, { actor: { type: "user", id: "domain-actor" } }),
  };
});
`,
  );
}

describe("definitions in server/domains/<domain>/<kind folder>/", () => {
  it("names a job after its domain and its path under jobs/, and runs it", async () => {
    const body = await guest().$fetch<{ jobNames: string[]; ran: string[] }>("/api/_domain-folders-check");

    expect(body.jobNames).toContain("order.ship.pack");
    expect(body.ran).toContain("packed");
  });

  it("runs an action from $actions under its domain name", async () => {
    const body = await guest().$fetch<{ placed: string }>("/api/_domain-folders-check");

    expect(body.placed).toBe("placed lamp");
  });

  it("finds a table, a factory and a policy in a domain folder, with the policy under $policies.<domain>", async () => {
    const body = await guest().$fetch<{ tables: string[]; factories: string[]; canView: boolean; otherCanView: boolean }>(
      "/api/_domain-kinds-check",
    );

    expect(body.tables).toContain("shipmentsTable");
    expect(body.factories).toContain("shipmentFactory");
    expect(body).toMatchObject({ canView: true, otherCanView: false });
  });

  it("renders a domain mail with the template of the domain's mail/templates/ folder", async () => {
    const { text } = await guest().$fetch<{ text: string }>("/api/_domain-mail-check");

    expect(text).toContain("Shipped lamp");
  });

  it("serves a router from a domain folder under the domain's tRPC namespace", async () => {
    const body = await guest().$fetch<{ result: { data: { json: number } } }>("/api/trpc/order.shipments.count");

    expect(body.result.data.json).toBe(3);
  });

  it("gives a policy and a router named after their domain the domain's own key and namespace", async () => {
    const policy = await guest().$fetch<{ canViewInvoice: boolean }>("/api/_domain-kinds-check");
    const router = await guest().$fetch<{ result: { data: { json: number } } }>("/api/trpc/invoice.total");

    expect(policy.canViewInvoice).toBe(true);
    expect(router.result.data.json).toBe(7);
  });
});
