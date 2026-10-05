import { configDefaults, defineConfig, type TestProjectInlineConfiguration } from "vitest/config";

async function ui(): Promise<TestProjectInlineConfiguration> {
  const { storybookTest } = await import("@storybook/addon-vitest/vitest-plugin");
  const { playwright } = await import("@vitest/browser-playwright");
  return {
    plugins: [storybookTest({ configDir: ".storybook" })],
    test: {
      name: "ui",
      browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "chromium" }] },
    },
  };
}

const wantsUi = process.env.NUXVEL_TEST_UI === "1" || process.env.VITEST_STORYBOOK === "true";

export default defineConfig(async () => {
  if (wantsUi) return { test: { projects: [await ui()] } };

  return {
    test: {
      environment: "node",
      globalSetup: ["./tests/setup/database.ts", "@nuxvel/nuxt/testing/global-setup"],
      setupFiles: ["@nuxvel/nuxt/testing/database", "@nuxvel/nuxt/testing/setup"],
      hookTimeout: 180000,
      testTimeout: 30000,
      provide: { nuxvelBrowserTimeout: 5000 },
      projects: [
        {
          extends: true,
          test: { name: "functional", exclude: [...configDefaults.exclude, "**/tests/e2e/**"] },
        },
        {
          extends: true,
          test: { name: "e2e", include: ["**/tests/e2e/**/*.test.ts"] },
        },
      ],
    },
  };
});
