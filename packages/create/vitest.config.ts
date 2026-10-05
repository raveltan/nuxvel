import { configDefaults, defineConfig } from "vitest/config";

const exclude = [...configDefaults.exclude, "template/**", ".nuxvel-test-*/**"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "scaffold",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: [...exclude, "test/**/*.release.test.ts"],
        },
      },
      {
        test: {
          name: "release",
          environment: "node",
          include: ["test/**/*.release.test.ts"],
          exclude,
        },
      },
    ],
  },
});
