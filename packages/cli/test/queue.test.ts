import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { type StartedCli, migrate, startCli } from "@nuxvel/test-helpers/cli";
import { startFakeSentry } from "@nuxvel/test-helpers/fake-sentry";
import { scratchSql } from "@nuxvel/test-helpers/sql";
import { scratchDatabase } from "./helpers/database.ts";
import { buildNuxtFixture } from "./helpers/fixtures.ts";
import { runCliWithEnv, runCliWithInput, stripAnsi, tableRows } from "./helpers/run.ts";
import { playgroundDir, scratchDir, scratchPlayground, sharedPlayground } from "./helpers/scratch.ts";
import { TEST_MAILPIT_URL, TEST_MAIL_URL } from "@nuxvel/test-helpers/services";
import { emptyWorkerRedis, waitFor } from "./helpers/services.ts";

async function unscheduledWaiting(queue: Queue) {
  return (await queue.getWaiting()).filter((job) => job.repeatJobKey === undefined);
}

describe("nuxvel queue, schedule and task commands", () => {
  const playground = sharedPlayground("queue");

  it("queue:failed refuses in production without NUXT_REDIS_URL instead of using localhost", async () => {
    const appDir = playground;
    const { NUXT_REDIS_URL: _url, ...rest } = process.env;
    const env = {
      ...rest,
      NODE_ENV: "production",
      NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const { stderr, exitCode } = await runCliWithEnv(appDir, env, "queue:failed");

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("NUXT_REDIS_URL: Required in production");
  }, 60000);

  it("tinker sends the playground's welcome mail, queue:work delivers it to Mailpit, and uploads resolve", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("tinker-mail");
    const redisUrl = await emptyWorkerRedis();
    const recipient = `tinker-${randomUUID()}@example.com`;

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_MAIL_URL: TEST_MAIL_URL,
      NUXT_AUTH_SECRET: "tinker-mail-secret-tinker-mail-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      const { stdout, exitCode } = await runCliWithInput(
        appDir,
        [
          `await transaction(() => $mails.welcome.send({ to: ${JSON.stringify(recipient)}, name: "Ada" }));`,
          'console.log("mail queued");',
          'console.log("upload", typeof defineUpload, typeof useBucket);',
          "",
        ].join("\n"),
        env,
        "tinker",
      );

      expect(exitCode, stdout).toBe(0);
      expect(stdout).toContain("mail queued");
      expect(stdout).toContain("upload function function");

      worker = startCli(appDir, ["queue:work"], { env });

      const search = new URL("/api/v1/search", TEST_MAILPIT_URL);
      search.searchParams.set("query", `to:"${recipient}"`);

      const id = await waitFor(async () => {
        const response = await fetch(search);
        const body = (await response.json()) as { messages: { ID: string }[] };
        return body.messages[0]?.ID;
      });

      const message = (await (
        await fetch(new URL(`/api/v1/message/${id}`, TEST_MAILPIT_URL))
      ).json()) as { Subject: string; HTML: string };

      expect(message.Subject, worker.output()).toBe("Welcome, Ada");
      expect(message.HTML).toContain("Welcome, Ada!");
    } finally {
      await worker?.stop();
      await queue.close();
    }
  }, 120000);

  it("queue:work runs a dispatched job's handler, writing its row", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("queue");
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    const sql = scratchSql(databaseUrl);
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      worker = startCli(appDir, ["queue:work"], { env });

      await queue.add("_probe.record", { version: 1, payload: { name: "worked" } });

      const names = await waitFor(async () => {
        const rows = await sql<{ name: string }[]>`select name from health_checks where name = 'worked'`;
        return rows.length > 0 ? rows.map((row) => row.name) : undefined;
      });

      expect(names, worker.output()).toEqual(["worked"]);

      const done = stripAnsi(await worker.waitForOutput(/_probe\.record #\d+ done/));

      expect(done).toMatch(/^\d{2}:\d{2}:\d{2} INFO +job {2}worker listening on queues "default", "limited", "mail", "push", "reports", "webhooks": \d+ jobs, \d+ queued listeners?, \d+ schedules, concurrency 5, outbox relayed on commit and every 1s/m);
      expect(done).toMatch(/^\d{2}:\d{2}:\d{2} INFO +job {2}_probe\.record #\d+ done {2}.*durationMs=\d+ms/m);
      expect(done).not.toMatch(/^\{/m);
    } finally {
      await worker?.stop();
      await queue.close();
    }
  }, 120000);

  it("queue:work --queue runs only the listed queues and refuses a queue no job uses", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("queue-named");
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const connection = { url: redisUrl, maxRetriesPerRequest: null };
    const defaultQueue = new Queue("nuxvel", { connection });
    const reportsQueue = new Queue("nuxvel-reports", { connection });
    const sql = scratchSql(databaseUrl);
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);

      const unknown = await runCliWithEnv(appDir, env, "queue:work", "--queue", "nope");

      expect(unknown.exitCode).not.toBe(0);
      expect(stripAnsi(unknown.stdout + unknown.stderr)).toContain('no job uses the queue "nope". Known queues: default, limited, mail, push, reports');

      worker = startCli(appDir, ["queue:work", "--queue", "reports"], { env });

      await defaultQueue.add("_probe.record", { version: 1, payload: { name: "on-default" } });
      await reportsQueue.add("_probe.record-report", { version: 1, payload: { name: "on-reports" } });

      await waitFor(async () => {
        const rows = await sql`select name from health_checks where name = 'on-reports'`;
        return rows.length > 0 ? true : undefined;
      });

      expect(stripAnsi(worker.output())).toContain('worker listening on queue "reports"');
      expect((await defaultQueue.getWaiting()).map((job) => job.name)).toContain("_probe.record");
      expect(await sql`select name from health_checks where name = 'on-default'`).toEqual([]);
    } finally {
      await worker?.stop();
      await defaultQueue.close();
      await reportsQueue.close();
    }
  }, 120000);

  it("queue:clear asks first, then removes the waiting or failed jobs of the listed queues and keeps the schedules", async () => {
    const appDir = playground;
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const connection = { url: redisUrl, maxRetriesPerRequest: null };
    const defaultQueue = new Queue("nuxvel", { connection });
    const reportsQueue = new Queue("nuxvel-reports", { connection });

    try {
      await defaultQueue.add("_probe.record", { version: 1, payload: { name: "waiting" } });
      await defaultQueue.add("_probe.record", { version: 1, payload: { name: "later" } }, { delay: 60_000 });
      await reportsQueue.add("_probe.record-report", { version: 1, payload: { name: "report" } });
      await defaultQueue.add("_probe.record", { version: 1, payload: { name: "broken" } });

      const failer = new Worker("nuxvel", null, { connection, autorun: false });
      const token = randomUUID();
      const failing = await failer.getNextJob(token);
      await failing?.moveToFailed(new Error("probe failure"), token, false);
      await failer.close();

      const refused = await runCliWithEnv(appDir, env, "queue:clear");

      expect(refused.exitCode).toBe(1);
      expect(stripAnsi(refused.stderr)).toContain("✖ queue:clear removes the waiting and failed jobs of every queue and needs a confirmation");
      expect(stripAnsi(refused.stderr)).toContain("→ Pass --force to run it without asking");
      expect(await unscheduledWaiting(defaultQueue)).toHaveLength(1);

      const waiting = await runCliWithEnv(appDir, env, "queue:clear", "--waiting", "--queue", "default", "--force");

      expect(waiting.exitCode, waiting.stderr).toBe(0);
      expect(stripAnsi(waiting.stderr)).toContain("✔ Removed 2 waiting job(s) from default");
      expect(await unscheduledWaiting(defaultQueue)).toHaveLength(0);
      expect(await defaultQueue.getFailedCount()).toBe(1);
      expect(await reportsQueue.getWaitingCount()).toBe(1);

      const delayed = await defaultQueue.getDelayed();

      expect(delayed.length).toBeGreaterThan(0);
      expect(delayed.every((job) => job.repeatJobKey !== undefined)).toBe(true);
      expect((await defaultQueue.getJobSchedulers()).map((scheduler) => scheduler.key)).toContain("nuxvel.prune-outbox");

      const failed = await runCliWithEnv(appDir, env, "queue:clear", "--failed", "--force");

      expect(failed.exitCode, failed.stderr).toBe(0);
      expect(stripAnsi(failed.stderr)).toContain("✔ Removed 1 failed job(s) from default, limited, mail, push, reports");
      expect(await defaultQueue.getFailedCount()).toBe(0);
      expect(await reportsQueue.getWaitingCount()).toBe(1);
    } finally {
      await defaultQueue.close();
      await reportsQueue.close();
    }
  }, 120000);

  it("queue:work refuses to start when a job and a schedule share a name", async () => {
    const fixtureCwd = scratchDir("worker-collision");

    buildNuxtFixture(fixtureCwd);
    cpSync(
      join(playgroundDir, "server/database/schema"),
      join(fixtureCwd, "server/database/schema"),
      { recursive: true },
    );
    mkdirSync(join(fixtureCwd, "server/jobs"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server/schedules"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "server/jobs/nightly.ts"),
      'import { z } from "zod";\n\nexport default defineJob({ input: z.object({}), handler: () => {} });\n',
    );
    writeFileSync(
      join(fixtureCwd, "server/schedules/nightly.ts"),
      "export default defineSchedule({ at: { hour: 3 }, handler: () => {} });\n",
    );

    const result = await runCliWithEnv(
      fixtureCwd,
      {
        ...process.env,
        NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
        NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
        NUXT_REDIS_URL: await emptyWorkerRedis(),
      },
      "queue:work",
    );
    expect(result.exitCode).toBe(1);
    expect(stripAnsi(result.stderr)).toMatch(
      /ERROR +job {2}the worker could not start: nuxvel queue:work: more than one job, queued listener or schedule is named "nightly"/,
    );
  }, 120000);

  it("queue:work reports a throwing job handler's error, tagged with the job name", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("queue-error-tracking");
    const redisUrl = await emptyWorkerRedis();
    const sentry = await startFakeSentry();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
      NUXT_PUBLIC_SENTRY_DSN: sentry.dsn,
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      worker = startCli(appDir, ["queue:work"], { env });

      await queue.add("_probe.always-fails", { version: 1, payload: {} });

      const event = await waitFor(async () =>
        sentry.events.find((candidate) => candidate.tags?.job === "_probe.always-fails"),
      );

      expect(event.exception?.values?.at(-1)?.value, worker.output()).toBe(
        "probe.always-fails always fails",
      );
    } finally {
      await worker?.stop();
      await queue.close();
      await sentry.close();
    }
  }, 120000);

  it("queue:work sends a job's reported error before it exits", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("queue-error-flush");
    const redisUrl = await emptyWorkerRedis();
    const sentry = await startFakeSentry({ respondAfterMs: 1000 });

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
      NUXT_PUBLIC_SENTRY_DSN: sentry.dsn,
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      const worker = startCli(appDir, ["queue:work"], { env });
      const exited = new Promise<{ code: number | null; at: number }>((resolve) =>
        worker.child.on("exit", (code) => resolve({ code, at: Date.now() })),
      );

      await queue.add("_probe.fails-while-stopping", { version: 1, payload: {} });

      const exit = await exited;

      expect(exit.code, worker.output()).toBe(0);
      expect(
        sentry.events.find((event) => event.tags?.job === "_probe.fails-while-stopping"),
        worker.output(),
      ).toBeDefined();
      expect(sentry.answered.every((at) => at <= exit.at)).toBe(true);
      expect(sentry.answered.length).toBeGreaterThan(0);
    } finally {
      await queue.close();
      await sentry.close();
    }
  }, 120000);

  it("queue:work broadcasts from a job to listeners in other processes", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("broadcast");
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    const subscriber = new Redis(redisUrl);
    const received: string[] = [];
    let worker: StartedCli | undefined;

    subscriber.on("message", (_topic: string, data: string) => received.push(data));

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });
      await subscriber.subscribe(`nuxvel:channel:${new URL(redisUrl).pathname.slice(1)}:_probe-public`);

      worker = startCli(appDir, ["queue:work"], { env });
      const { output } = worker;

      await queue.add(
        "_probe.broadcast",
        { version: 1, payload: { title: "From a job" } },
        { attempts: 1 },
      );

      const messages = await waitFor(async () => {
        if (received.length > 0) return received;
        const [failed] = await queue.getFailed();
        if (failed) throw new Error(`${failed.failedReason}\n${output()}`);
        return undefined;
      });

      expect(
        messages.map((published) => JSON.parse(published.slice(published.indexOf("\n") + 1))),
      ).toEqual([
        { event: "from-job", payload: { title: "From a job" } },
      ]);
    } finally {
      await worker?.stop();
      await subscriber.quit();
      await queue.close();
    }
  }, 120000);

  it("queue:work relays an outbox row left behind by a crashed process", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("outbox");
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    const sql = scratchSql(databaseUrl);
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      await sql`insert into outbox (job_name, payload) values ('_probe.record', ${sql.json({ version: 1, payload: { name: "relayed" } })})`;

      worker = startCli(appDir, ["queue:work"], { env });

      const names = await waitFor(async () => {
        const rows = await sql<{ name: string }[]>`select name from health_checks where name = 'relayed'`;
        return rows.length > 0 ? rows.map((row) => row.name) : undefined;
      });

      expect(names, worker.output()).toEqual(["relayed"]);

      const dispatched = await waitFor(async () => {
        const rows = await sql<{ dispatched_at: Date | null }[]>`select dispatched_at from outbox`;
        return rows.every((row) => row.dispatched_at !== null) ? rows.length : undefined;
      });

      expect(dispatched, worker.output()).toBe(1);
    } finally {
      await worker?.stop();
      await queue.close();
    }
  }, 120000);

  it("queue:work upcasts a queued listener's payload and runs its handler, writing its row", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("listener");
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    const sql = scratchSql(databaseUrl);
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      worker = startCli(appDir, ["queue:work"], { env });

      await queue.add("listener:_record-probe-queued", {
        version: 1,
        payload: { label: "listened" },
      });

      const names = await waitFor(async () => {
        const rows = await sql<{ name: string }[]>`select name from health_checks where name = 'listened'`;
        return rows.length > 0 ? rows.map((row) => row.name) : undefined;
      });

      expect(names, worker.output()).toEqual(["listened"]);
      expect(worker.output()).toMatch(/\d+ queued listeners?,/);
    } finally {
      await worker?.stop();
      await queue.close();
    }
  }, 120000);

  it("queue:work retries a failing job and only the exhausted one lands in the failed set", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("queue-retry");
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    });
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      worker = startCli(appDir, ["queue:work"], { env });

      await queue.add("_probe.always-fails", { version: 1, payload: {} });
      await queue.add("_probe.flaky", { version: 1, payload: { name: "retried" } });

      const failed = await waitFor(async () => {
        const jobs = await queue.getFailed();
        return jobs.length > 0 ? jobs : undefined;
      });

      const completed = await waitFor(async () => {
        const jobs = await queue.getCompleted();
        const flaky = jobs.filter((job) => job.name === "_probe.flaky");
        return flaky.length > 0 ? flaky : undefined;
      });

      expect(failed.map((job) => job.name)).toEqual(["_probe.always-fails"]);
      expect(failed.map((job) => job.attemptsMade)).toEqual([3]);
      expect(completed.map((job) => job.name)).toEqual(["_probe.flaky"]);
      expect(completed.map((job) => job.attemptsMade)).toEqual([2]);

      const logged = stripAnsi(await worker.waitForOutput(/_probe\.flaky #\d+ done/));

      expect(logged).toMatch(/WARN +job {2}_probe\.always-fails #\d+ failed, retrying \(attempt 1\/3\)/);
      expect(logged).toMatch(/WARN +job {2}_probe\.always-fails #\d+ failed, retrying \(attempt 2\/3\)/);
      expect(logged).toMatch(/ERROR +job {2}_probe\.always-fails #\d+ failed \(attempt 3\/3\)/);
      expect(logged).toMatch(/WARN +job {2}_probe\.flaky #\d+ failed, retrying \(attempt 1\/3\)/);
      expect(logged).toMatch(/INFO +job {2}_probe\.flaky #\d+ done/);
    } finally {
      await worker?.stop();
      await queue.close();
    }
  }, 120000);

  it("queue:work registers each schedule shape under its cron pattern, runs a handler on it, and schedule:list describes it", async () => {
    const appDir = scratchPlayground("queue-work");
    const databaseUrl = await scratchDatabase("schedule");
    const redisUrl = await emptyWorkerRedis();
    const shapes = {
      "every-15-minutes": ["every: { minutes: 15 }", "*/15 * * * *", "every 15 minutes"],
      "every-6-hours": ["every: { hours: 6 }", "0 */6 * * *", "every 6 hours"],
      "every-day": ["every: { days: 1 }", "0 0 * * *", "every day at 00:00"],
      "half-hourly": ["at: { minute: [30, 0] }", "0,30 * * * *", "every hour at :00, :30"],
      "twice-on-weekdays": [
        'at: { hour: [9, 17], weekday: ["monday", "friday"] }',
        "0 9,17 * * 1,5",
        "09:00, 17:00 on monday, friday",
      ],
      "twice-a-month": ["at: { day: [1, 15], hour: 6, minute: 30 }", "30 6 1,15 * *", "06:30 on day 1, 15"],
      "new-year": ['at: { month: "january" }', "0 0 1 1 *", "00:00 on day 1 in january"],
    } as const;

    mkdirSync(join(appDir, "server/schedules/_shapes"), { recursive: true });

    for (const [file, [timing]] of Object.entries(shapes)) {
      writeFileSync(
        join(appDir, `server/schedules/_shapes/${file}.ts`),
        `export default defineSchedule({ ${timing}, handler: () => {} });\n`,
      );
    }

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    const sql = scratchSql(databaseUrl);
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      worker = startCli(appDir, ["queue:work"], { env });

      const schedulers = await waitFor(async () => {
        const found = await queue.getJobSchedulers();
        return found.length > Object.keys(shapes).length + 3 ? found : undefined;
      });

      expect(
        Object.fromEntries(schedulers.map((scheduler) => [scheduler.key, scheduler.pattern])),
        worker.output(),
      ).toEqual({
        "_probe.tick": "*/2 * * * * *",
        "nuxvel.auth.reencrypt-two-factor": "15 4 * * *",
        "nuxvel.billing.reconcile": "15 3 * * *",
        "nuxvel.prune-outbox": "30 4 * * *",
        ...Object.fromEntries(Object.entries(shapes).map(([file, [, pattern]]) => [`_shapes.${file}`, pattern])),
      });

      const ticks = await waitFor(async () => {
        const rows = await sql<
          { name: string }[]
        >`select name from health_checks where name = 'ticked'`;
        return rows.length > 0 ? rows : undefined;
      });

      expect(ticks.length, worker.output()).toBeGreaterThan(0);
    } finally {
      await worker?.stop();
      await queue.close();
    }

    const list = await runCliWithEnv(appDir, env, "schedule:list");
    const { header, rows } = tableRows(list.stdout);
    const nextRun = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

    expect(list.exitCode, list.stderr).toBe(0);
    expect(header).toEqual(["NAME", "RUNS", "NEXT RUN", "NOTE"]);
    expect(rows).toContainEqual(["_probe.tick", "every 2 seconds", nextRun]);
    expect(rows).toContainEqual(["nuxvel.auth.reencrypt-two-factor", "04:15 every day", nextRun]);
    expect(rows).toContainEqual(["nuxvel.prune-outbox", "04:30 every day", nextRun]);
    expect(rows).toContainEqual(["nuxvel.billing.reconcile", "03:15 every day", nextRun]);

    for (const [file, [, , description]] of Object.entries(shapes)) {
      expect(rows).toContainEqual([`_shapes.${file}`, description, nextRun]);
    }

    const json = await runCliWithEnv(appDir, env, "schedule:list", "--json");
    const { schedules } = JSON.parse(json.stdout);

    expect(json.exitCode, json.stderr).toBe(0);
    expect(schedules.map((schedule: { name: string }) => schedule.name)).toEqual(rows.map((row) => row[0]));

    for (const [file, [, pattern, description]] of Object.entries(shapes)) {
      expect(schedules).toContainEqual({
        name: `_shapes.${file}`,
        storedAs: `_shapes.${file}`,
        description,
        pattern,
        nextRun,
        orphaned: false,
      });
    }
  }, 120000);

  it("queue:work registers its schedules and leaves one from a newer build alone", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("schedule-reconcile");
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      await queue.upsertJobScheduler(
        "probe.from-newer-build",
        { pattern: "*/2 * * * * *" },
        { name: "probe.from-newer-build" },
      );

      worker = startCli(appDir, ["queue:work"], { env });

      await worker.waitForOutput("worker listening on queue");

      const keys = (await queue.getJobSchedulers()).map((scheduler) => scheduler.key);

      expect(keys.sort(), worker.output()).toEqual(["_probe.tick", "nuxvel.auth.reencrypt-two-factor", "nuxvel.billing.reconcile", "nuxvel.prune-outbox", "probe.from-newer-build"]);
    } finally {
      await worker?.stop();
      await queue.close();
    }
  }, 120000);

  it("queue:work runs a job queued under the old name a renamed() alias keeps, and keeps a moved schedule's scheduler", async () => {
    const appDir = scratchPlayground("queue-renamed");
    const databaseUrl = await scratchDatabase("queue-renamed");
    const redisUrl = await emptyWorkerRedis();

    writeFileSync(
      join(appDir, "server/jobs/_probe/record-before-move.ts"),
      'import record from "./record";\n\nexport default renamed(record);\n',
    );
    writeFileSync(
      join(appDir, "server/schedules/_probe/tick-before-move.ts"),
      'import tick from "./tick";\n\nexport default renamed(tick);\n',
    );

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    const sql = scratchSql(databaseUrl);
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });
      await queue.add("_probe.record-before-move", { version: 1, payload: { name: "queued-before-the-move" } });

      worker = startCli(appDir, ["queue:work"], { env });

      const names = await waitFor(async () => {
        const rows = await sql<{ name: string }[]>`select name from health_checks where name = 'queued-before-the-move'`;
        return rows.length > 0 ? rows.map((row) => row.name) : undefined;
      });

      expect(names, worker.output()).toEqual(["queued-before-the-move"]);

      const keys = (await queue.getJobSchedulers()).map((scheduler) => scheduler.key);

      expect(keys.sort(), worker.output()).toEqual(["_probe.tick-before-move", "nuxvel.auth.reencrypt-two-factor", "nuxvel.billing.reconcile", "nuxvel.prune-outbox"]);
    } finally {
      await worker?.stop();
      await queue.close();
    }

    const list = await runCliWithEnv(appDir, env, "schedule:list");
    const { rows } = tableRows(list.stdout);

    expect(list.exitCode, list.stderr).toBe(0);
    expect(rows).toContainEqual([
      "_probe.tick",
      "every 2 seconds",
      expect.stringMatching(/^\d{4}-/),
      "stored as _probe.tick-before-move",
    ]);
    expect(list.stdout + list.stderr).not.toContain("orphaned");
  }, 120000);

  it("schedule:list flags an orphaned entry, and schedule:prune removes only that one", async () => {
    const appDir = playground;
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });

    try {
      await queue.obliterate({ force: true });

      await queue.upsertJobScheduler(
        "_probe.tick",
        { pattern: "*/2 * * * * *" },
        { name: "_probe.tick" },
      );
      await queue.upsertJobScheduler(
        "probe.gone",
        { pattern: "0 3 * * *" },
        { name: "probe.gone" },
      );

      const { stdout, stderr, exitCode } = await runCliWithEnv(appDir, env, "schedule:list");
      const { rows } = tableRows(stdout);
      const nextRun = expect.stringMatching(/^\d{4}-/);

      expect(exitCode, stderr).toBe(0);
      expect(rows).toContainEqual(["_probe.tick", "every 2 seconds", nextRun]);
      expect(rows).toContainEqual(["probe.gone", "-", nextRun, "orphaned, no defineSchedule in code"]);
      expect(stripAnsi(stderr)).toContain("▲ 1 orphaned schedule in Redis");
      expect(stripAnsi(stderr)).toContain("→ Run nuxvel schedule:prune");

      const json = await runCliWithEnv(appDir, env, "schedule:list", "--json");

      expect(json.exitCode, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout).schedules).toContainEqual({
        name: "probe.gone",
        storedAs: "probe.gone",
        description: null,
        pattern: "0 3 * * *",
        nextRun,
        orphaned: true,
      });

      const dryRun = await runCliWithEnv(appDir, env, "schedule:prune", "--dry-run");

      expect(dryRun.exitCode, dryRun.stderr).toBe(0);
      expect(stripAnsi(dryRun.stderr)).toContain("Would remove probe.gone, no defineSchedule in code");
      expect((await queue.getJobSchedulers()).map((scheduler) => scheduler.key).sort()).toEqual(["_probe.tick", "probe.gone"]);

      const pruned = await runCliWithEnv(appDir, env, "schedule:prune");

      expect(pruned.exitCode, pruned.stderr).toBe(0);
      expect(pruned.stdout).toBe("");
      expect(stripAnsi(pruned.stderr)).toContain("✔ Removed probe.gone, no defineSchedule in code");
      expect((await queue.getJobSchedulers()).map((scheduler) => scheduler.key)).toEqual(["_probe.tick"]);
    } finally {
      await queue.close();
    }
  }, 120000);

  it("schedule:run runs one tick of a schedule now and names a missing one", async () => {
    const databaseUrl = await scratchDatabase("schedule-run");
    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };
    const sql = scratchSql(databaseUrl);

    await migrate(playground, env);

    const ran = await runCliWithEnv(playground, env, "schedule:run", "_probe.tick");

    expect(ran.exitCode, ran.stderr).toBe(0);
    expect(stripAnsi(ran.stderr)).toContain("✔ _probe.tick finished");
    expect((await sql<{ name: string }[]>`select name from health_checks`).map((row) => row.name)).toEqual(["ticked"]);

    const missing = await runCliWithInput(playground, "", env, "schedule:run", "nope");

    expect(missing.exitCode).toBe(1);
    expect(stripAnsi(missing.stderr)).toContain('✖ no schedule named "nope"');
    expect(stripAnsi(missing.stderr)).toContain("→ Run nuxvel schedule:list to see the schedules");
  }, 120000);

  it("task:run runs a task by name, passes it the --payload, and reports a task's own 404 as its error", async () => {
    const appDir = scratchPlayground("task-run");
    const databaseUrl = await scratchDatabase("task");

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    writeFileSync(
      join(appDir, "server/tasks/find-post.ts"),
      [
        "export default defineTask({",
        '  meta: { name: "find-post" },',
        "  run: () => {",
        '    throw createError({ statusCode: 404, message: "post 42 is gone" });',
        "  },",
        "});",
        "",
      ].join("\n"),
    );
    mkdirSync(join(appDir, "modules/probe-task"), { recursive: true });
    writeFileSync(
      join(appDir, "modules/probe-task/index.ts"),
      [
        'import { createResolver, defineNuxtModule } from "@nuxt/kit";',
        "",
        "export default defineNuxtModule({",
        "  setup(_, nuxt) {",
        '    const handler = createResolver(import.meta.url).resolve("./task");',
        '    nuxt.options.nitro.tasks = { ...nuxt.options.nitro.tasks, "probe:from-module": { handler } };',
        "  },",
        "});",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(appDir, "modules/probe-task/task.ts"),
      'export default defineTask({ meta: { name: "probe:from-module" }, run: () => ({ result: "module task ran" }) });\n',
    );

    const sql = scratchSql(databaseUrl);

    await migrate(appDir, env);

    const { stdout, stderr, exitCode } = await runCliWithEnv(
      appDir,
      env,
      "task:run",
      "_probe-record",
      "--payload",
      JSON.stringify({ name: "tasked" }),
    );

    expect(exitCode, stderr).toBe(0);
    expect(stripAnsi(stderr)).toContain("✔ _probe-record finished");
    expect(stdout.split("\n")).toHaveLength(2);
    expect(() => JSON.parse(stdout)).not.toThrow();

    const rows = await sql<{ name: string }[]>`select name from health_checks`;

    expect(rows.map((row) => row.name)).toEqual(["tasked"]);

    const missing = await runCliWithInput(appDir, "", env, "task:run", "nope");

    expect(missing.exitCode).toBe(1);
    expect(stripAnsi(missing.stderr)).toContain('✖ no task named "nope"');
    expect(stripAnsi(missing.stderr)).toContain("→ A task is a file under server/tasks");

    const fromModule = await runCliWithEnv(appDir, env, "task:run", "probe:from-module");

    expect(fromModule.exitCode, fromModule.stderr).toBe(0);
    expect(JSON.parse(fromModule.stdout)).toBe("module task ran");

    const notFoundInside = await runCliWithInput(appDir, "", env, "task:run", "find-post");

    expect(notFoundInside.exitCode).toBe(1);
    expect(stripAnsi(notFoundInside.stderr)).toContain("✖ post 42 is gone");
    expect(stripAnsi(notFoundInside.stderr)).not.toContain("no task named");

    const notAnObject = await runCliWithInput(appDir, "", env, "task:run", "_probe-record", "--payload", "[1]");

    expect(notAnObject.exitCode).toBe(2);
    expect(stripAnsi(notAnObject.stderr)).toContain("✖ --payload must be a JSON object");
  }, 120000);

  it("queue:versions groups queued jobs by payload version and flags the unmigratable ones", async () => {
    const appDir = playground;
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });

    try {
      await queue.obliterate({ force: true });

      await queue.add("_probe.record-unmigrated", { version: 1, payload: { name: "done" } });
      const finisher = new Worker("nuxvel", null, {
        connection: { url: redisUrl, maxRetriesPerRequest: null },
        autorun: false,
      });
      const token = randomUUID();
      const finished = await finisher.getNextJob(token);
      await finished?.moveToCompleted("done", token, false);
      await finisher.close();
      expect(await queue.getCompletedCount()).toBe(1);

      await queue.add("nuxvel.prune-outbox", {}, { delay: 60_000 });
      await queue.add("_probe.record", { version: 1, payload: { name: "a" } });
      await queue.add("_probe.record", { version: 1, payload: { name: "b" } });
      await queue.add("_probe.record", { version: 1, payload: { name: "urgent" } }, { priority: 1 });
      await queue.add("_probe.record-renamed", { version: 1, payload: { label: "c" } });
      await queue.add("_probe.record-renamed", { version: 2, payload: { name: "d" } });
      await queue.add("_probe.record-unmigrated", { version: 1, payload: { name: "e" } });
      await queue.add("listener:_record-probe-queued", { version: 1, payload: { label: "f" } });

      const { stdout, stderr, exitCode } = await runCliWithEnv(appDir, env, "queue:versions");
      const { header, rows } = tableRows(stdout);

      expect(exitCode, stderr).toBe(0);
      expect(header).toEqual(["NAME", "VERSION", "JOBS", "DELAYED", "PRIORITIZED", "PROBLEM"]);
      expect(rows).toEqual([
        ["_probe.record", "v1", "3", "0", "1"],
        ["_probe.record-renamed", "v1", "1", "0", "0"],
        ["_probe.record-renamed", "v2", "1", "0", "0"],
        ["_probe.record-unmigrated", "v1", "1", "0", "0", "no upcaster for version 1"],
        ["listener:_record-probe-queued", "v1", "1", "0", "0"],
        ["nuxvel.prune-outbox", "cron", "1", "1", "0"],
      ]);
      expect(stripAnsi(stderr)).toContain("▲ 1 group the current code cannot run");

      const json = await runCliWithEnv(appDir, env, "queue:versions", "--json");

      expect(json.exitCode, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout).groups).toEqual([
        { name: "_probe.record", version: 1, schedule: false, count: 3, delayed: 0, prioritized: 1, problem: null },
        { name: "_probe.record-renamed", version: 1, schedule: false, count: 1, delayed: 0, prioritized: 0, problem: null },
        { name: "_probe.record-renamed", version: 2, schedule: false, count: 1, delayed: 0, prioritized: 0, problem: null },
        {
          name: "_probe.record-unmigrated",
          version: 1,
          schedule: false,
          count: 1,
          delayed: 0,
          prioritized: 0,
          problem: "no upcaster for version 1",
        },
        { name: "listener:_record-probe-queued", version: 1, schedule: false, count: 1, delayed: 0, prioritized: 0, problem: null },
        { name: "nuxvel.prune-outbox", version: null, schedule: true, count: 1, delayed: 1, prioritized: 0, problem: null },
      ]);
    } finally {
      await queue.close();
    }
  }, 120000);

  it("queue:failed lists an exhausted job and queue:retry re-runs it off the failed set", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("queue-failed");
    const redisUrl = await emptyWorkerRedis();

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "queue-test-secret-queue-test-secret",
    };

    const queue = new Queue("nuxvel", {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    let worker: StartedCli | undefined;

    try {
      await migrate(appDir, env);
      await queue.obliterate({ force: true });

      worker = startCli(appDir, ["queue:work"], { env: { ...env, NUXT_LOG_FORMAT: "json" } });
      const { output } = worker;

      const jobLines = () =>
        output()
          .split("\n")
          .filter((line) => line.startsWith("{"))
          .map((line) => JSON.parse(line) as Record<string, unknown>)
          .filter((line) => line.tag === "job");

      await queue.add(
        "_probe.flaky",
        { version: 1, payload: { name: "manual-retry" } },
        { attempts: 1 },
      );

      const failedJob = await waitFor(async () => {
        const [job] = await queue.getFailed();
        return job;
      });

      const failedLine = await waitFor(async () => jobLines().find((line) => line.level === "error"));

      expect(failedLine, output()).toEqual({
        time: expect.any(String),
        level: "error",
        tag: "job",
        msg: `_probe.flaky #${failedJob.id} failed (attempt 1/1)`,
        jobId: String(failedJob.id),
        name: "_probe.flaky",
        attempt: 1,
        durationMs: expect.any(Number),
        err: expect.objectContaining({ message: "probe.flaky needs another go", stack: expect.any(String) }),
      });
      expect(jobLines()[0]).toMatchObject({ level: "info", queues: ["default", "limited", "mail", "push", "reports", "webhooks"], concurrency: 5 });

      const listed = await runCliWithEnv(appDir, env, "queue:failed");

      expect(listed.exitCode, listed.stderr).toBe(0);
      expect(tableRows(listed.stdout).rows).toEqual([
        ["default", String(failedJob.id), "_probe.flaky", "1", expect.stringMatching(/^\d{4}-/), String(failedJob.failedReason)],
      ]);

      const json = await runCliWithEnv(appDir, env, "queue:failed", "--json");

      expect(json.exitCode, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout)).toEqual({
        jobs: [
          {
            queue: "default",
            id: String(failedJob.id),
            name: "_probe.flaky",
            attempts: 1,
            failedAt: new Date(Number(failedJob.finishedOn)).toISOString(),
            reason: failedJob.failedReason,
          },
        ],
      });

      const retried = await runCliWithEnv(appDir, env, "queue:retry", "all");

      expect(retried.exitCode, retried.stderr).toBe(0);
      expect(retried.stdout).toBe("");
      expect(stripAnsi(retried.stderr)).toContain("✔ Re-enqueued 1 job(s)");

      const completed = await waitFor(async () => {
        const jobs = await queue.getCompleted();
        const flaky = jobs.filter((job) => job.name === "_probe.flaky");
        return flaky.length > 0 ? flaky : undefined;
      });

      expect(completed.map((job) => job.name)).toEqual(["_probe.flaky"]);

      const doneLine = await waitFor(async () => jobLines().find((line) => line.msg === `_probe.flaky #${failedJob.id} done`));

      expect(doneLine).toMatchObject({ level: "info", jobId: String(failedJob.id), name: "_probe.flaky", attempt: expect.any(Number) });
      expect(await queue.getFailed()).toEqual([]);

      const nothing = await runCliWithInput(appDir, "", env, "queue:retry", "all");

      expect(nothing.exitCode).toBe(1);
      expect(stripAnsi(nothing.stderr)).toContain("✖ No failed jobs to retry");
      expect(stripAnsi(nothing.stderr)).toContain("→ Run nuxvel queue:failed to list the failed jobs");
    } finally {
      await worker?.stop();
      await queue.close();
    }
  }, 120000);
});
