import { once } from "node:events";
import { expect } from "@nuxvel/nuxt/testing";
import { Redis } from "ioredis";
import postgres from "postgres";
import { afterAll, describe, it, onTestFinished } from "vitest";
import { openChannelStream } from "./helpers/channel-stream";
import { startSecondServer } from "./helpers/second-server";
import { TEST_ADMIN_DATABASE_URL } from "@nuxvel/test-helpers/services";
import { workerRedisUrl } from "./setup/redis";

const CLIENT_NAME = `nuxvel-close-${process.env.VITEST_POOL_ID ?? "0"}`;

const sql = postgres(TEST_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });
const redis = new Redis(workerRedisUrl());

afterAll(async () => {
  await sql.end();
  await redis.quit();
});

async function postgresConnections() {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from pg_stat_activity where application_name = ${CLIENT_NAME}
  `;

  return row?.count ?? 0;
}

async function redisClients() {
  const list = String(await redis.client("LIST"));

  return list.split("\n").filter((line) => line.includes(` name=${CLIENT_NAME} `)).length;
}

describe("the server on nitro close", () => {
  it("ends its realtime streams and closes every Postgres, Redis and S3 connection, so the process exits without being forced", async () => {
    const redisUrl = new URL(workerRedisUrl());

    redisUrl.searchParams.set("connectionName", CLIENT_NAME);

    const server = await startSecondServer({
      env: {
        PGAPPNAME: CLIENT_NAME,
        NUXT_REDIS_URL: redisUrl.toString(),
        NITRO_SHUTDOWN_NO_FORCE_EXIT: "1",
        NITRO_SHUTDOWN_TIMEOUT: "500",
      },
    });

    onTestFinished(() => {
      if (server.child.exitCode === null) server.child.kill("SIGKILL");
    });

    await fetch(new URL("/api/_queue-dispatch-check", server.url));
    expect((await fetch(new URL("/api/_storage-check?key=close&body=closed", server.url))).status).toBe(200);
    expect(
      (
        await fetch(new URL("/api/uploads/_avatar", server.url), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "image/png", size: 10 }),
        })
      ).status,
    ).toBe(200);

    const stream = await openChannelStream("_probe-public", {}, server.url);

    expect(await stream.next()).toMatchObject({ event: "connected" });
    expect(await postgresConnections()).toBeGreaterThan(0);
    expect(await redisClients()).toBeGreaterThanOrEqual(2);

    const exited = once(server.child, "exit");

    server.child.kill("SIGTERM");

    expect(await stream.next()).toBe("ended");

    const [code, signal] = await exited;
    expect({ code, signal }).toEqual({ code: 0, signal: null });
    expect(await postgresConnections()).toBe(0);
    expect(await redisClients()).toBe(0);
  }, 15_000);

  it("ends an open stream on SIGTERM before the graceful HTTP close, so the process exits within seconds", async () => {
    const server = await startSecondServer({ env: { NITRO_SHUTDOWN_NO_FORCE_EXIT: "1" } });

    onTestFinished(() => {
      if (server.child.exitCode === null) server.child.kill("SIGKILL");
    });

    const stream = await openChannelStream("_probe-public", {}, server.url);

    expect(await stream.next()).toMatchObject({ event: "connected" });

    const exited = once(server.child, "exit");

    server.child.kill("SIGTERM");

    expect(await stream.next(5000)).toBe("ended");

    const [code] = await exited;
    expect(code).toBe(0);
  }, 10_000);
});
