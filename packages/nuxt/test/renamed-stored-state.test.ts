import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import postgres from "postgres";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { setupApp } from "./helpers/playground";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const appDir = scratchAppDir("renamed-state");

function write(path: string, contents: string) {
  mkdirSync(dirname(join(appDir, path)), { recursive: true });
  writeFileSync(join(appDir, path), contents);
}

describe("a schedule, a flag and a backfill moved behind renamed()", async () => {
  beforeAll(() => {
    createScratchApp(appDir);
    write("server/schedules/nightly.ts", "export default defineSchedule({ at: { hour: 3 }, handler: async () => {} });\n");
    write("server/schedules/nightly-before-move.ts", 'import nightly from "./nightly";\n\nexport default renamed(nightly);\n');
    write("server/flags/rollout.ts", "export default defineFlag({ default: false });\n");
    write("server/flags/rollout-before-move.ts", 'import rollout from "./rollout";\n\nexport default renamed(rollout);\n');
    write(
      "server/database/backfills/names.ts",
      `import { eq, like } from "drizzle-orm";
import { healthChecksTable } from "../schema/health-check.schema";

export default defineBackfill({
  table: healthChecksTable,
  batchSize: 1,
  where: like(healthChecksTable.name, "backfill-%"),
  async handler(rows) {
    for (const row of rows) {
      await useDb().update(healthChecksTable).set({ name: \`\${row.name}+\` }).where(eq(healthChecksTable.id, row.id));
    }
  },
});
`,
    );
    write(
      "server/database/backfills/names-before-move.ts",
      'import names from "./names";\n\nexport default renamed(names);\n',
    );
    write(
      "server/api/renamed-state.post.ts",
      `export default defineEventHandler(async () => {
  const evaluated = await flag("rollout", { id: "user-1" });

  await setFlagTargeting("rollout", { percentage: 10 });
  await runBackfill("names");

  return { evaluated };
});
`,
    );
  });
  afterAll(() => removeScratchApp(appDir));

  await setupApp({ rootDir: appDir, env: { NUXVEL_ROLE: "worker" } });

  it("keeps the schedule's BullMQ scheduler under its old name", async () => {
    const queue = new Queue("nuxvel", { connection: { url: process.env.NUXT_REDIS_URL, maxRetriesPerRequest: null } });

    try {
      await vi.waitFor(
        async () => {
          const keys = (await queue.getJobSchedulers()).map((scheduler) => scheduler.key);
          expect(keys.sort()).toEqual(["nightly-before-move", "nuxvel.auth.reencrypt-two-factor", "nuxvel.billing.reconcile", "nuxvel.prune-outbox"]);
        },
        { timeout: 10_000 },
      );
    } finally {
      await queue.close();
    }
  });

  it("reads and writes the flag's targeting, and resumes the backfill's cursor, under their old names", async () => {
    const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");
    const sql = postgres(process.env.NUXT_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });

    try {
      await redis.set("nuxvel:flags:rollout-before-move", JSON.stringify({ percentage: 100 }));
      const [first] = await sql<{ id: number }[]>`
        insert into health_checks (name) values ('backfill-1'), ('backfill-2') returning id
      `;
      await sql`
        insert into backfills (name, cursor, processed, total)
        values ('names-before-move', ${sql.json(first?.id ?? 0)}, 1, 2)
      `;

      expect(await guest().$fetch("/api/renamed-state", { method: "POST" })).toEqual({ evaluated: true });

      expect(JSON.parse((await redis.get("nuxvel:flags:rollout-before-move")) ?? "{}")).toMatchObject({ percentage: 10 });
      expect(await redis.get("nuxvel:flags:rollout")).toBeNull();
      expect((await sql`select name from health_checks order by id`).map((row) => row.name)).toEqual([
        "backfill-1",
        "backfill-2+",
      ]);
      expect(await sql`select name, processed, completed_at is not null as completed from backfills`).toEqual([
        { name: "names-before-move", processed: 2, completed: true },
      ]);
    } finally {
      redis.disconnect();
      await sql.end();
    }
  });
});
