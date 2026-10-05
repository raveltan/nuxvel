import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const watchedRouter = () => join(useTestContext().options.rootDir, "server/trpc/routers/watched.ts");

export function addRoutersDir(appDir: string) {
  mkdirSync(join(appDir, "server/trpc/routers"), { recursive: true });
}

async function pingStatus() {
  return (await guest().fetch("/api/trpc/watched.ping")).status;
}

describe("the dev server with a router file added and removed", () => {
  it("serves the new router's procedure without a restart", async () => {
    expect(await pingStatus()).toBe(404);

    writeFileSync(watchedRouter(), 'export default { ping: publicProcedure.query(() => "watched") };\n');

    await expect.poll(pingStatus, { timeout: 90_000, interval: 250 }).toBe(200);
  }, 100_000);

  it("stops serving it once the file is removed", async () => {
    rmSync(watchedRouter());

    await expect.poll(pingStatus, { timeout: 90_000, interval: 250 }).toBe(404);
  }, 100_000);
});
