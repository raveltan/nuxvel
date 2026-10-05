import { createServer, connect, type Socket } from "node:net";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { beforeAll, describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { openStream } from "./helpers/channel-stream";
import { devServerOptions } from "./helpers/dev-server";
import { readDevtoolsSections, sectionResult } from "./helpers/devtools-sections";
import { workerRedisUrl } from "./setup/redis";
import { setupApp } from "./helpers/playground";
import type { CollectedEntry } from "../src/runtime/server/observe/collector/collected-entry";

async function redisProxy() {
  const target = new URL(workerRedisUrl());
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    const upstream = connect(Number(target.port), target.hostname);

    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => socket.destroy());
    }
    client.pipe(upstream).pipe(client);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `redis://127.0.0.1:${port}${target.pathname}`,
    takeDown() {
      server.close();
      for (const socket of sockets) socket.destroy();
    },
  };
}

describe("the nuxvel DevTools tab with Redis down", async () => {
  const options = devServerOptions();
  const redis = await redisProxy();

  await setupApp({ ...options, browser: true, env: { ...options.env, NUXT_REDIS_URL: redis.url } });

  beforeAll(() => redis.takeDown());

  it("still loads the database sections, and marks only the jobs section failed", async () => {
    const { results } = await readDevtoolsSections();

    expect(sectionResult(results, "audit").status).toBe("ready");
    expect(sectionResult(results, "procedures").status).toBe("ready");
    expect(sectionResult(results, "jobs")).toMatchObject({ status: "failed" });
  }, 15_000);

  it("starts no second load of the jobs section while its first still waits on Redis", async () => {
    const loads = () => guest().$fetch<Record<string, number>>("/_nuxvel/test/section-loads");
    const before = (await loads()).audit ?? 0;
    const stream = await openStream("/_nuxvel/devtools/api/stream");

    try {
      await expect
        .poll(async () => (await loads()).audit ?? 0, { timeout: 25_000, interval: 500 })
        .toBeGreaterThanOrEqual(before + 3);
    } finally {
      stream.close();
    }

    expect((await loads()).jobs).toBe(1);
  }, 30_000);

  it("shows them in the tab", async () => {
    const page = await createPage();

    await page.goto(url("/_nuxvel/devtools/"));

    await page.locator('[data-section="audit"][data-status="ready"]').waitFor();
    await page.locator('[data-section="procedures"][data-status="ready"]').getByText("post.create").waitFor();
    await page.locator('[data-section="jobs"][data-status="failed"]').getByText("Could not load").waitFor();
  }, 15_000);

  it("keeps the Redis connection failure, logged outside any request, in a server entry", async () => {
    await readDevtoolsSections();

    await expect
      .poll(async () => {
        const entries = await guest().$fetch<CollectedEntry[]>("/_nuxvel/test/collected");

        return entries
          .filter((entry) => entry.kind === "server")
          .flatMap((entry) => entry.spans)
          .some((span) => span.type === "log" && span.data.tag === "redis" && span.data.message.includes("connection failed"));
      }, { timeout: 15_000 })
      .toBe(true);
  }, 20_000);
});
