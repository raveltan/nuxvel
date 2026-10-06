import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const actionFile = (root: string) => join(root, "server/actions/mounted/ping.action.ts");

export function addWatchedAction(appDir: string) {
  mkdirSync(join(appDir, "server/actions/mounted"), { recursive: true });
  writeFileSync(actionFile(appDir), 'export const pingAction = defineAction({ handler: () => "pong" });\n');
}

function typedRouters() {
  return readFileSync(join(useTestContext().options.rootDir, ".nuxt/nuxvel/trpc-routers.ts"), "utf8");
}

async function pingStatus() {
  const response = await guest()
    .fetch("/api/trpc/mounted.ping", { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(2_000) })
    .catch(() => undefined);

  return response?.status;
}

describe("the dev server with an action file edited to set procedure", () => {
  it("mounts the action, and types it on $api, once the edit lands", async () => {
    expect(await pingStatus()).toBe(404);
    expect(typedRouters()).not.toContain("mountAction");

    writeFileSync(
      actionFile(useTestContext().options.rootDir),
      'import { z } from "zod";\n\nexport const pingAction = defineAction({ procedure: "public", output: z.string(), handler: () => "pong" });\n',
    );

    await expect.poll(pingStatus, { timeout: 90_000, interval: 500 }).toBe(200);
    await expect.poll(typedRouters, { timeout: 30_000, interval: 500 }).toContain("mountAction(action0)");
  }, 100_000);
});
