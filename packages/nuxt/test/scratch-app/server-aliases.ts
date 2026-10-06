import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

function write(appDir: string, path: string, contents: string) {
  mkdirSync(dirname(join(appDir, path)), { recursive: true });
  writeFileSync(join(appDir, path), contents);
}

export function addServerAliasChecks(appDir: string) {
  write(appDir, "server/utils/aliased-greeting.ts", `export const aliasedGreeting = "hello from server";\n`);
  write(appDir, "shared/aliased-farewell.ts", `export const aliasedFarewell = "goodbye from shared";\n`);
  write(
    appDir,
    "server/api/_aliases-check.get.ts",
    `import { aliasedGreeting } from "#server/utils/aliased-greeting";
import { aliasedFarewell } from "#shared/aliased-farewell";

export default defineEventHandler(() => ({ aliasedGreeting, aliasedFarewell }));
`,
  );
}

describe("an app that imports through #server and #shared", () => {
  it("resolves both aliases in the nitro build", async () => {
    const body = await guest().$fetch("/api/_aliases-check");

    expect(body).toEqual({ aliasedGreeting: "hello from server", aliasedFarewell: "goodbye from shared" });
  });
});
