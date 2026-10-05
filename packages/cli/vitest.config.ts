import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "commands",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "test/**/*.release.test.ts"],
          globalSetup: ["@nuxvel/test-helpers/services"],
          env: { PLAYGROUND_TEST_PROBES: "1" },
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: "release",
          environment: "node",
          include: ["test/**/*.release.test.ts"],
          globalSetup: ["@nuxvel/test-helpers/services"],
          testTimeout: 30000,
        },
      },
    ],
  },
});
