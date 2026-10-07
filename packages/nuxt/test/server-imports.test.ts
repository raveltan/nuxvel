import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadNuxt } from "@nuxt/kit";
import { expect } from "@nuxvel/nuxt/testing";
import { beforeAll, describe, it } from "vitest";
import { playgroundDir, testBuildDir } from "./helpers/test-builds";

const runtime = fileURLToPath(new URL("../src/runtime/", import.meta.url));
const autoImportsDoc = fileURLToPath(new URL("../../../docs/auto-imports.md", import.meta.url));

async function nitroImports() {
  const nuxt = await loadNuxt({
    cwd: playgroundDir,
    ready: false,
    overrides: { _prepare: true, buildDir: testBuildDir("server-imports") },
  });
  let imports: { name: string; as?: string; from: string }[] = [];

  nuxt.hook("nitro:init", async (nitro) => {
    imports = (await nitro.unimport?.getImports()) ?? [];
  });
  await nuxt.ready();
  await nuxt.close();

  return imports;
}

describe("server auto-imports", () => {
  let names: string[];

  beforeAll(async () => {
    names = (await nitroImports())
      .filter((entry) => entry.from.startsWith(runtime))
      .map((entry) => entry.as ?? entry.name);
  }, 120_000);

  it("auto-imports the public server API", () => {
    expect(names).toEqual(
      expect.arrayContaining([
        "useDb",
        "currentLocale",
        "transaction",
        "defineAction",
        "publicProcedure",
        "authedProcedure",
        "useCaller",
        "defineJob",
        "sendMailNow",
        "can",
        "JobName",
        "SessionUser",
      ]),
    );
  });

  it("keeps nuxvel's internals out of the server's global scope", () => {
    for (const internal of [
      "handler",
      "t",
      "appRouter",
      "errorFormatter",
      "actorContext",
      "requestIdContext",
      "logActionCall",
      "enqueueJob",
      "installEffectReplacements",
      "removeEffectReplacement",
      "effectReplacement",
      "publishObserved",
      "subscribeObserved",
      "findJob",
      "findListener",
      "findFlag",
      "flagDefinitions",
      "policyRegistry",
      "ruleAllowsSystem",
      "isRetryableJobError",
      "isKnownTaxonomyError",
      "countQueries",
      "queryCountLogger",
      "withUniqueViolationMapping",
      "transactionContext",
      "auth",
      "SYSTEM_ACTOR_TYPE",
      "API_KEY_ACTOR_TYPE",
      "dispatchAfterCommit",
      "broadcast",
      "broadcastAfterCommit",
      "sendMail",
      "emit",
      "notify",
    ]) {
      expect(names, internal).not.toContain(internal);
    }
  });

  it("leaves the clients whose types load an SDK to their subpaths", () => {
    expect(names).not.toContain("useS3");
    expect(names).not.toContain("useQueue");
    expect(names).not.toContain("useRedis");
    expect(names).toContain("RedisPurpose");
  });

  it("leaves the namespaces of the seeders and backfills to an explicit import", () => {
    expect(names).not.toContain("$seeders");
    expect(names).not.toContain("$backfills");
  });

  it("lists every server auto-import in docs/auto-imports.md", () => {
    const documented = [
      ...readFileSync(autoImportsDoc, "utf8").matchAll(/^\| `(\w+)` \|/gm),
    ].map((match) => match[1]);

    expect([...documented].sort()).toEqual([...new Set(names)].sort());
  });
});
