import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { TEST_STORAGE_URL } from "@nuxvel/test-helpers/services";
import { cachedTestBuild } from "../../src/testing/test-build";
import { playgroundDir, probesLayer } from "../helpers/test-builds";

declare module "vitest" {
  interface ProvidedContext {
    playgroundBuild: { rootDir: string; buildDir: string; outputDir: string };
  }
}

export default async function buildPlayground(project: TestProject) {
  process.env.NUXT_STORAGE_URL = TEST_STORAGE_URL;

  const { buildDir, release } = await cachedTestBuild(playgroundDir, { dotenv: false, layers: [probesLayer] });

  project.provide("playgroundBuild", { rootDir: playgroundDir, buildDir, outputDir: join(buildDir, "output") });

  return release;
}
