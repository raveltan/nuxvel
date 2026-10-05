import { fileURLToPath } from "node:url";
import { defineVitestProject } from "@nuxt/test-utils/config";
import { TEST_MAIL_URL, TEST_MAILPIT_URL, TEST_STORAGE_URL } from "@nuxvel/test-helpers/services";
import { configDefaults, defineConfig } from "vitest/config";
import { TEST_STORAGE_BUCKET } from "./test/setup/constants.ts";

export default defineConfig({
  test: {
    maxWorkers: "75%",
    projects: [
      {
        resolve: {
          alias: {
            "#nuxvel/test-namespaces": fileURLToPath(
              new URL("../../playground/.nuxt/nuxvel/test-namespaces.mjs", import.meta.url),
            ),
          },
        },
        test: {
          name: "functional",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "test/**/*.nuxt.test.ts"],
          globalSetup: ["@nuxvel/test-helpers/services", "./test/setup/global.ts", "./test/setup/playground-build.ts"],
          env: {
            NUXT_MAIL_URL: TEST_MAIL_URL,
            NUXT_MAILPIT_URL: TEST_MAILPIT_URL,
            NUXT_STORAGE_URL: TEST_STORAGE_URL,
            NUXT_STORAGE_BUCKET: TEST_STORAGE_BUCKET,
          },
          setupFiles: [
            "./test/setup/worker.ts",
            "./test/setup/redis.ts",
            "./test/setup/reset.ts",
            "@nuxvel/nuxt/testing/setup",
          ],
        },
      },
      await defineVitestProject({
        test: {
          name: "nuxt",
          include: ["test/**/*.nuxt.test.ts"],
          environment: "nuxt",
          setupFiles: ["./test/setup/nuxt-locales.ts"],
          hookTimeout: 60_000,
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL("../../playground", import.meta.url)),
            },
          },
        },
      }),
    ],
  },
});
