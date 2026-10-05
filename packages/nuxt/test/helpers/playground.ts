import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { loadNuxt, useNuxt } from "@nuxt/kit";
import { setup, startServer, useTestContext } from "@nuxt/test-utils/e2e";
import { beforeAll, inject } from "vitest";
import { serverAddress } from "../../src/testing/server-address";
import { testBuildDir } from "./test-builds";

type SetupOptions = NonNullable<Parameters<typeof setup>[0]>;

const SERVER_START_TIMEOUT = 120_000;

function dotenvKeys(rootDir: string) {
  const file = join(rootDir, ".env");

  return existsSync(file) ? Object.keys(parseEnv(readFileSync(file, "utf8"))) : [];
}

export async function setupApp(options: SetupOptions & { rootDir: string }) {
  const server = options.server ?? true;
  // a dev build here would run a second nitro and vite dev pipeline on the same buildDir as `nuxi dev`, racing its writes
  const build = options.build ?? (!options.dev && (options.browser !== false || server));
  let keysBeforeLoad = new Set<string>();

  beforeAll(() => {
    keysBeforeLoad = new Set(Object.keys(process.env));
  });

  await setup({ buildDir: testBuildDir("build", options.rootDir), ...options, ...(options.dev ? {} : await serverAddress(options)), build, server: false });

  beforeAll(async () => {
    if (options.dev) {
      useTestContext().nuxt = await loadNuxt({ cwd: options.rootDir, dev: true, overrides: options.nuxtConfig });
    }

    for (const key of dotenvKeys(options.rootDir)) {
      if (!keysBeforeLoad.has(key)) delete process.env[key];
    }

    if (server) await startServer();
  }, SERVER_START_TIMEOUT);
}

export async function setupPlayground(options: Pick<SetupOptions, "browser" | "browserOptions" | "env"> = {}) {
  const { rootDir, outputDir } = inject("playgroundBuild");

  await setup({ rootDir, build: false, nuxtConfig: { nitro: { output: { dir: outputDir } } }, ...options, ...(await serverAddress(options)) });
}

export function playgroundBuild() {
  return inject("playgroundBuild");
}

export const withoutPlaygroundImgSrc = {
  "modules:before"() {
    // the playground's own img-src would replace nuxvel's default; nuxt-security types NuxtOptions only in the app
    const { security } = useNuxt().options as { security?: { headers?: { contentSecurityPolicy?: Record<string, unknown> } } };

    delete security?.headers?.contentSecurityPolicy?.["img-src"];
  },
};
