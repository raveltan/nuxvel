import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { scratchDatabase } from "./helpers/database.ts";
import { runCliWithEnv, stripAnsi, tableRows } from "./helpers/run.ts";
import { sharedPlayground } from "./helpers/scratch.ts";
import { emptyWorkerRedis } from "./helpers/services.ts";

describe("nuxvel down, up and maintenance:status", () => {
  const playground = sharedPlayground("maintenance");

  it("stores the state in Redis, pauses and resumes the queue, reports it in maintenance:status and doctor", async () => {
    const redisUrl = await emptyWorkerRedis();
    const env = {
      ...process.env,
      NUXT_DATABASE_URL: await scratchDatabase("maintenance"),
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "maintenance-test-secret-of-32-characters",
    };
    const redis = new Redis(redisUrl);
    const queue = new Queue("nuxvel", { connection: { url: redisUrl, maxRetriesPerRequest: null } });

    try {
      const down = await runCliWithEnv(
        playground,
        env,
        "down",
        "--message",
        "Upgrading the database",
        "--retry",
        "120",
        "--secret",
        "deploy-2026-09",
        "--allow",
        "203.0.113.7",
        "--allow=::1",
      );

      expect(down.exitCode, down.stderr).toBe(0);
      expect(down.stdout).toBe("");
      expect(stripAnsi(down.stderr)).toContain("✔ The app is down for maintenance, the queue is paused");
      expect(stripAnsi(down.stderr)).toContain("→ Bypass it at /deploy-2026-09");
      expect(JSON.parse((await redis.get("nuxvel:maintenance")) ?? "null")).toEqual({
        message: "Upgrading the database",
        retryAfter: 120,
        secret: "deploy-2026-09",
        allow: ["203.0.113.7", "::1"],
        keepQueue: false,
        since: expect.any(String),
      });
      expect(await queue.isPaused()).toBe(true);

      const json = await runCliWithEnv(playground, env, "maintenance:status", "--json");

      expect(json.exitCode, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout)).toEqual({
        down: true,
        message: "Upgrading the database",
        retryAfter: 120,
        since: expect.any(String),
        allow: ["203.0.113.7", "::1"],
        bypass: true,
        queuePaused: true,
      });
      expect(JSON.stringify(JSON.parse(json.stdout))).not.toContain("deploy-2026-09");

      const table = await runCliWithEnv(playground, env, "maintenance:status");

      expect(tableRows(table.stdout).rows[0]).toEqual([
        "down",
        expect.any(String),
        "120s",
        "secret",
        "203.0.113.7,::1",
        "paused",
        "Upgrading the database",
      ]);

      const doctor = await runCliWithEnv(playground, env, "doctor", "--json");
      const maintenance = JSON.parse(doctor.stdout).checks.find((check: { name: string }) => check.name === "maintenance");

      expect(maintenance).toMatchObject({
        status: "warning",
        findings: [{ detail: expect.stringContaining("the app is down for maintenance since"), hint: "Run nuxvel up when the work is done" }],
      });

      const up = await runCliWithEnv(playground, env, "up");

      expect(up.exitCode, up.stderr).toBe(0);
      expect(stripAnsi(up.stderr)).toContain("✔ The app is up, the queue runs again");
      expect(await redis.get("nuxvel:maintenance")).toBeNull();
      expect(await queue.isPaused()).toBe(false);
      expect(JSON.parse((await runCliWithEnv(playground, env, "maintenance:status", "--json")).stdout)).toEqual({
        down: false,
        queuePaused: false,
      });

      const again = await runCliWithEnv(playground, env, "up");

      expect(again.exitCode).toBe(0);
      expect(stripAnsi(again.stderr)).toContain("✔ The app was not down");

      const keepQueue = await runCliWithEnv(playground, env, "down", "--keep-queue");

      expect(keepQueue.exitCode, keepQueue.stderr).toBe(0);
      expect(stripAnsi(keepQueue.stderr)).toContain("the queue keeps running");
      expect(await queue.isPaused()).toBe(false);
      expect(JSON.parse((await redis.get("nuxvel:maintenance")) ?? "null")).toMatchObject({
        message: "The app is down for maintenance. Please check back soon.",
        retryAfter: 60,
        secret: null,
        allow: [],
      });
    } finally {
      await queue.close();
      await redis.quit();
    }
  }, 180000);

  it("refuses an invalid --retry, --secret or --allow as a usage error", async () => {
    const invalid = [
      [["--retry", "soon"], "✖ --retry must be a whole number of seconds of at least 1"],
      [["--secret", "a/b"], "✖ --secret must be at least 8 letters, digits, - or _"],
      [["--allow", "localhost"], '✖ --allow "localhost" is not an IP address'],
    ] as const;

    for (const [args, message] of invalid) {
      const result = await runCliWithEnv(playground, process.env, "down", ...args);

      expect(result.exitCode).toBe(2);
      expect(stripAnsi(result.stderr)).toContain(message);
    }
  });
});
