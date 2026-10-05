import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inject } from "vitest";

declare module "vitest" {
  interface ProvidedContext {
    testRunId: string;
  }
}

export const playgroundDir = fileURLToPath(new URL("../../../../playground", import.meta.url));

export const probesLayer = fileURLToPath(new URL("../fixtures/probes", import.meta.url));

function testRunDir(runId: string, rootDir = playgroundDir) {
  return join(rootDir, ".nuxt", "test", runId);
}

export function testBuildDir(label: string, rootDir = playgroundDir) {
  return join(testRunDir(inject("testRunId"), rootDir), `${label}-${randomUUID()}`);
}

export function removeTestRunBuilds(runId: string) {
  rmSync(testRunDir(runId), { recursive: true, force: true, maxRetries: 3 });
}
