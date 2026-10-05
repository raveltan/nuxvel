import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

export function addUserDataEraseCheck(appDir: string) {
  mkdirSync(join(appDir, "server/api"), { recursive: true });
  writeFileSync(
    join(appDir, "server/api/_user-data-erase-check.get.ts"),
    `import { randomUUID } from "node:crypto";

export default defineEventHandler(async () => {
  try {
    return { erased: await eraseUserData(randomUUID()) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});
`,
  );
}

describe("eraseUserData in an app that declares no user data", () => {
  it("throws instead of reporting an empty erasure", async () => {
    const body = await guest().$fetch<{ error?: string }>("/api/_user-data-erase-check");

    expect(body.error).toContain("no user data is declared");
  });
});
