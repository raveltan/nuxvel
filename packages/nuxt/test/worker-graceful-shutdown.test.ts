import { once } from "node:events";
import { expect } from "@nuxvel/nuxt/testing";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import postgres from "postgres";
import { afterAll, describe, it, onTestFinished } from "vitest";
import { startSecondServer } from "./helpers/second-server";
import { workerRedisUrl } from "./setup/redis";
import { workerDatabaseUrl } from "./setup/worker";

const sql = postgres(workerDatabaseUrl(), { max: 1, onnotice: () => {} });
const redis = new Redis(workerRedisUrl());
const queue = new Queue("nuxvel", { connection: { url: workerRedisUrl(), maxRetriesPerRequest: null } });

afterAll(async () => {
  await queue.close();
  await redis.quit();
  await sql.end();
});

function closeLines(output: string) {
  return output.split("\n").filter((line) => line.includes("closing every connection"));
}

describe("a built server with NUXVEL_ROLE=worker", () => {
  it("finishes the job in flight on SIGTERM and closes once, through nitro's graceful shutdown", async () => {
    const server = await startSecondServer({ env: { NUXVEL_ROLE: "worker", NUXT_LOG_LEVEL: "debug" } });

    onTestFinished(() => {
      if (server.child.exitCode === null) server.child.kill("SIGKILL");
    });

    const job = await queue.add("_probe.held", { version: 1, payload: { name: "held-through-sigterm" } });

    await expect.poll(() => job.getState(), { timeout: 20_000, interval: 50 }).toBe("active");

    const exited = once(server.child, "exit");

    server.child.kill("SIGTERM");
    await redis.set("_probe.held:held-through-sigterm", "1");

    const [code, signal] = await exited;

    expect({ code, signal }, server.output()).toEqual({ code: 0, signal: null });
    expect(await job.getState()).toBe("completed");
    expect(await sql`select 1 from health_checks where name = 'held-through-sigterm'`).toHaveLength(1);
    expect(closeLines(server.output()), server.output()).toHaveLength(1);
  }, 40_000);
});
