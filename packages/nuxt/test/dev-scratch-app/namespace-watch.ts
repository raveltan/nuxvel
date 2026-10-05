import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getServerLogs, useTestContext } from "@nuxt/test-utils/e2e";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

function write(path: string, contents: string) {
  const file = join(useTestContext().options.rootDir, path);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

export function addNamespacesRoute(root: string) {
  mkdirSync(join(root, "server/api"), { recursive: true });
  writeFileSync(
    join(root, "server/api/namespaces.get.ts"),
    "export default defineEventHandler(() => ({ jobs: Object.keys($jobs), events: Object.keys($events) }));\n",
  );
}

async function namespaces() {
  return guest().$fetch("/api/namespaces", { timeout: 2_000, retry: 0 }).catch(() => undefined);
}

describe("the dev server with definitions added in new folders one after another", () => {
  it("serves both in their namespaces when the second lands while the server restarts for the first", async () => {
    expect(await namespaces()).toEqual({ jobs: [], events: [] });

    write("server/jobs/watched/ping.job.ts", 'import { z } from "zod";\n\nexport const watchedPingJob = defineJob({ input: z.object({}), handler: async () => {} });\n');
    write("server/jobs/watched/ping.job.test.ts", "export {};\n");
    await expect.poll(namespaces, { timeout: 30_000, interval: 100 }).toBeUndefined();
    write("server/events/watched/pinged.event.ts", 'import { z } from "zod";\n\nexport const watchedPingedEvent = defineEvent({ payload: z.object({}) });\n');
    write("server/events/watched/pinged.event.test.ts", "export {};\n");

    await expect.poll(namespaces, { timeout: 90_000, interval: 500 }).toEqual({ jobs: ["watched"], events: ["watched"] });
    expect(getServerLogs().filter((line) => line.includes("ERROR"))).toEqual([]);
  }, 100_000);
});
