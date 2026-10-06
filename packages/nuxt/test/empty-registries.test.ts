import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, describe, it } from "vitest";
import { buildActionsModuleCode } from "../src/actions";
import { buildDiscoveredModuleCode } from "../src/discovered-module";
import { buildEventsModuleCode } from "../src/events";
import { buildMailTemplatesModuleCode } from "../src/mail-templates";
import { buildTaskNamesModuleCode } from "../src/task-names";
import { buildTranslationsModuleCode } from "../src/translations";
import { buildUserDataModuleCode } from "../src/user-data";

const fixturesDir = fileURLToPath(new URL("./type-fixtures", import.meta.url));
const runtimeDir = fileURLToPath(new URL("../src/runtime/server", import.meta.url));
const testingDir = fileURLToPath(new URL("../src/testing", import.meta.url));
const tsc = fileURLToPath(new URL("../../../node_modules/typescript/bin/tsc", import.meta.url));
function typeErrors(project: string) {
  try {
    execFileSync(process.execPath, [tsc, "--project", project], { stdio: "pipe" });
    return "";
  } catch (error) {
    return error instanceof Error && "stdout" in error ? String(error.stdout) : String(error);
  }
}

const appDir = mkdtempSync(join(fixturesDir, ".nuxvel-test-empty-registries-"));

const emptyModules = {
  channels: buildDiscoveredModuleCode("channels", []),
  backfills: buildDiscoveredModuleCode("database/backfills", []),
  seeders: buildDiscoveredModuleCode("seeders", [], "seeder"),
  uploads: buildDiscoveredModuleCode("uploads", []),
  webhooks: buildDiscoveredModuleCode("webhooks", []),
  events: buildEventsModuleCode([]),
  listeners: buildDiscoveredModuleCode("listeners", []),
  schedules: buildDiscoveredModuleCode("schedules", []),
  flags: buildDiscoveredModuleCode("flags", []),
  "rate-limits": buildDiscoveredModuleCode("rate-limits", [], "rate limit"),
  actions: buildActionsModuleCode([]),
  "task-names": buildTaskNamesModuleCode([]),
  "error-classifiers": buildDiscoveredModuleCode("errors", []),
  translations: buildTranslationsModuleCode({ en: [] }),
  "user-data": buildUserDataModuleCode([]),
  "mail-templates": buildMailTemplatesModuleCode(new Map()),
};

const registries = [
  "jobs/registry.ts",
  "jobs/schedule-registry.ts",
  "mail/registry.ts",
  "realtime/registry.ts",
  "backfills/registry.ts",
  "seeders/registry.ts",
  "storage/registry.ts",
  "webhooks/registry.ts",
  "events/registry.ts",
  "flags/registry.ts",
  "security/rate-limit-registry.ts",
  "testing/action-registry.ts",
  "cli/task-run.ts",
  "cli/db-seed.ts",
];

const testingFixtures = [
  "fakes/events.ts",
  "fakes/mail.ts",
  "fakes/queue.ts",
  "emit-event.ts",
  "render-mail.ts",
  "run-action.ts",
  "run-backfill.ts",
  "run-seeder.ts",
  "run-job.ts",
  "run-schedule.ts",
];

for (const [name, code] of Object.entries(emptyModules)) {
  writeFileSync(join(appDir, `${name}.ts`), code);
}

writeFileSync(
  join(appDir, "tsconfig.json"),
  JSON.stringify({
    extends: "../tsconfig.base.json",
    compilerOptions: {
      noUncheckedIndexedAccess: true,
      paths: {
        "#nuxvel/schema": ["../nuxvel-stubs/schema.ts"],
        "#nuxvel/jobs": ["../nuxvel-stubs/built-in-jobs.ts"],
        "#nuxvel/mails": ["../nuxvel-stubs/built-in-mails.ts"],
        "#nuxvel/*": ["./*.ts"],
      },
    },
    files: [
      "../nitro-globals.d.ts",
      ...registries.map((file) => join(runtimeDir, file)),
      ...testingFixtures.map((file) => join(testingDir, file)),
    ],
  }),
);

describe("an app with no file in a discovered folder", () => {
  afterAll(() => {
    rmSync(appDir, { recursive: true, force: true });
  });

  it("typechecks every registry, and the testing fixtures typed by them, against the builders' empty output", () => {
    expect(typeErrors(join(appDir, "tsconfig.json"))).toBe("");
  }, 60_000);
});
