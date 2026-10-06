import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, expectAudited, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const jobRegistry = fileURLToPath(new URL("../../src/runtime/server/jobs/registry", import.meta.url));
const backfillStatus = fileURLToPath(new URL("../../src/runtime/server/cli/backfill-status", import.meta.url));

function write(appDir: string, path: string, contents: string) {
  mkdirSync(dirname(join(appDir, path)), { recursive: true });
  writeFileSync(join(appDir, path), contents);
}

export function addTableNameChecks(appDir: string) {
  write(
    appDir,
    "server/actions/record-sign-up.action.ts",
    `import { z } from "zod";

export const recordSignUpAction = defineAction({
  input: z.object({ userId: z.string() }),
  handler: ({ userId }) => audit("user.signed-up", { type: "user", id: userId }),
});
`,
  );
  write(
    appDir,
    "server/api/_table-names-check.get.ts",
    `import { eq } from "drizzle-orm";
import { z } from "zod";
import { recordSignUpAction } from "../actions/record-sign-up.action";
import { auditLogTable, auditSubjectsTable } from "../database/schema/audit-log.schema";

export default defineEventHandler(async (event) => {
  const { userId } = await getValidatedQuery(event, z.object({ userId: z.string() }).parse);

  await recordSignUpAction({ userId }, { actor: { type: "user", id: userId } });

  const subject = await useDb()
    .select()
    .from(auditSubjectsTable)
    .where(eq(auditSubjectsTable.userId, userId))
    .then(firstOrFail);
  const entry = await useDb()
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.targetId, subject.id))
    .then(firstOrFail);

  return { displayName: subject.displayName, action: entry.action };
});
`,
  );
  write(
    appDir,
    "server/database/backfills/table-names-users.backfill.ts",
    `import { userTable } from "../schema/auth.schema";

export const tableNamesUsersBackfill = defineBackfill({
  table: userTable,
  batchSize: 10,
  handler: async () => {},
});
`,
  );
  write(
    appDir,
    "server/api/_table-names-backfill-check.get.ts",
    `import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runBackfillStatus } from "${relative(join(appDir, "server/api"), backfillStatus)}";

export default defineEventHandler(async () => {
  const outFile = join(tmpdir(), \`\${randomUUID()}.json\`);

  await runBackfill("table-names-users");
  await runBackfillStatus(outFile);

  return JSON.parse(await readFile(outFile, "utf8"));
});
`,
  );
  write(
    appDir,
    "server/jobs/table-names/ping.job.ts",
    `import { z } from "zod";

export const tableNamesPingJob = defineJob({
  input: z.object({}),
  handler: async () => {},
});
`,
  );
  write(
    appDir,
    "server/mail/table-names.mail.ts",
    `import { h } from "vue";
import { z } from "zod";

export const tableNamesMail = defineMail({
  input: z.object({ to: z.email() }),
  subject: () => "Table names",
  render: ({ to }) =>
    h("mjml", [h("mj-body", [h("mj-section", [h("mj-column", [h("mj-text", to)])])])]),
});
`,
  );
  write(
    appDir,
    "server/notifications/table-names.notification.ts",
    `import { z } from "zod";

export const tableNamesNotification = defineNotification({
  schema: z.object({}),
  via: ["database", "mail", "push"],
  toDatabase: () => ({ title: "Table names", body: "Found by SQL name." }),
  toMail: () => ({ mail: "table-names", data: {} }),
  toPush: () => ({ title: "Table names", body: "Found by SQL name." }),
});
`,
  );
  write(
    appDir,
    "server/flags/table-names-cta.experiment.ts",
    `export const tableNamesCtaExperiment = defineExperiment({
  variants: { control: 1, green: 1 },
  metrics: ["table-names.converted"],
});
`,
  );
  write(
    appDir,
    "server/api/_table-names-effects-check.get.ts",
    `import { randomUUID } from "node:crypto";
import { eq, gt, max } from "drizzle-orm";
import { z } from "zod";
import { findJob } from "${relative(join(appDir, "server/api"), jobRegistry)}";
import { notificationsTable } from "../database/schema/notifications.schema";
import { outboxTable } from "../database/schema/outbox.schema";

function outboxAfter(id: number) {
  return useDb().select().from(outboxTable).where(gt(outboxTable.id, id)).orderBy(outboxTable.id);
}

export default defineEventHandler(async (event) => {
  const { userId, email } = await getValidatedQuery(event, z.object({ userId: z.string(), email: z.email() }).parse);
  const suppressed = \`\${randomUUID()}@example.com\`;
  const before = await useDb().select({ id: max(outboxTable.id) }).from(outboxTable).then(firstOrFail);
  const start = before.id ?? 0;

  await suppressMail(suppressed, "bounce");
  await transaction(async () => {
    await $jobs.tableNames.ping.dispatch({});
    await $mails.tableNames.send({ to: suppressed });
    await $notifications.tableNames.notify(userId, {});
  });

  const queued = await outboxAfter(start);
  const relayed = await relayOutbox();

  for (const row of queued.filter((candidate) => candidate.jobName !== "table-names.ping")) {
    await findJob(row.jobName)?.run(row.payload);
  }

  const mailedTo = (await outboxAfter(queued.at(-1)?.id ?? start))
    .filter((row) => row.jobName === "nuxvel.mail")
    .map((row) => z.object({ payload: z.object({ to: z.string() }) }).parse(row.payload).payload.to);
  const stored = await useDb().select().from(notificationsTable).where(eq(notificationsTable.userId, userId));

  await startExperiment("table-names-cta");
  await experiment("table-names-cta", { id: userId });
  await track("table-names.converted", { id: userId });
  const report = await experimentReport("table-names-cta");

  return {
    queued: queued.map((row) => row.jobName),
    relayed: relayed >= queued.length,
    mailedTo,
    notifications: stored.length,
    exposures: report.variants.reduce((sum, variant) => sum + variant.exposures, 0),
    conversions: report.variants.flatMap((variant) => variant.metrics).reduce((sum, metric) => sum + metric.conversions, 0),
  };
});
`,
  );
}

describe("an app that exports the starter tables as userTable, sessionTable and so on", () => {
  it("signs up a user and writes an audit row about them", async () => {
    const signUp = await guest().$fetch<{ user: { id: string } }>("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Tabled User", email: `${randomUUID()}@example.com`, password: "correct-horse-battery-staple" },
    });

    const body = await guest().$fetch("/api/_table-names-check", { query: { userId: signUp.user.id } });

    expect(body).toEqual({ displayName: "Tabled User", action: "user.signed-up" });
    await expect(expectAudited("user.signed-up", { targetId: signUp.user.id })).resolves.toMatchObject({ targetType: "user" });
  });

  it("dispatches a job through the outbox, sends a mail and a notification, and reads an experiment", async () => {
    const email = `${randomUUID()}@example.com`;
    const signUp = await guest().$fetch<{ user: { id: string } }>("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Tabled User", email, password: "correct-horse-battery-staple" },
    });

    const body = await guest().$fetch("/api/_table-names-effects-check", { query: { userId: signUp.user.id, email } });

    expect(body).toEqual({
      queued: ["table-names.ping", "nuxvel.notification", "nuxvel.push"],
      relayed: true,
      mailedTo: [email],
      notifications: 1,
      exposures: 1,
      conversions: 1,
    });
  });

  it("runs a backfill and reports its progress", async () => {
    await guest().$fetch("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Tabled User", email: `${randomUUID()}@example.com`, password: "correct-horse-battery-staple" },
    });

    const body = await guest().$fetch<{ backfills: { name: string; processed: number; total: number; completedAt: string | null }[] }>(
      "/api/_table-names-backfill-check",
    );

    const status = body.backfills.find((backfill) => backfill.name === "table-names-users");

    expect(status).toMatchObject({ completedAt: expect.any(String) });
    expect(status?.processed).toBe(status?.total);
    expect(status?.total).toBeGreaterThan(0);
  });
});
