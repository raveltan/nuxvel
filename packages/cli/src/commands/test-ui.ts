import { defineCommand } from "citty";
import { runProjectBin } from "../run-project-bin.ts";

/**
 * `nuxvel test:ui` runs the stories of the app as Vitest browser tests: the `ui` project of its Vitest config.
 *
 * It sets `NUXVEL_TEST_UI=1`, so the config loads `@storybook/addon-vitest`, and passes the extra arguments to
 * `vitest run --project ui`. It starts no dev services. A story fails when its `play` function throws.
 *
 * @example
 * ```sh
 * nuxvel test:ui app/components/TaskForm.stories.ts
 * ```
 */
export default defineCommand({
  meta: {
    name: "test:ui",
    description:
      "Run the project's stories as Vitest browser tests, the `ui` project of its Vitest config (passthrough to `vitest run`, extra arguments included). Set NUXVEL_TEST_UI=1, so the config loads @storybook/addon-vitest. Start no dev services.",
  },
  async run({ rawArgs }) {
    process.exitCode = await runProjectBin(process.cwd(), "vitest", ["run", "--project", "ui", ...rawArgs], {
      installHint: "npm i -D vitest @storybook/addon-vitest @vitest/browser-playwright",
      env: { NUXVEL_TEST_UI: "1" },
    });
  },
});
