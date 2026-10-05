import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const cliEntry = fileURLToPath(new URL("../../../cli/bin/nuxvel.mjs", import.meta.url));

export function makeGadgetPolicy(appDir: string) {
  execFileSync("node", [cliEntry, "make:schema", "gadget"], { cwd: appDir });
  execFileSync("node", [cliEntry, "make:policy", "gadget"], { cwd: appDir });
  mkdirSync(join(appDir, "server/api"), { recursive: true });
  writeFileSync(
    join(appDir, "server/api/_make-policy-check.get.ts"),
    `import discoveredPolicies from "#nuxvel/policies";
import { gadgetTable } from "../database/schema/gadget.schema";

export default defineEventHandler(async () => {
  const policy = discoveredPolicies.find(
    (candidate: { tableName: string }) => candidate.tableName === "gadget",
  );

  return {
    discovered: Boolean(policy),
    allowed: await can({ type: "user", id: "actor" }, "update", gadgetTable, {}),
  };
});
`,
  );
}

describe("make:policy generator output", () => {
  it("auto-discovers the generated policy and can() denies any action with no crash", async () => {
    const body = await guest().$fetch("/api/_make-policy-check");

    expect(body).toMatchObject({
      discovered: true,
      allowed: false,
    });
  });
});
