import { defineCommand } from "citty";
import { loadAppLayout } from "../app-layout/load-app-layout.ts";
import { ARCHITECTURE_FOLDERS, lintArchitecture } from "../arch/lint-architecture.ts";
import { fail } from "../ui/fail.ts";
import { errorMessage } from "../error-message.ts";
import { error, plural, success, warn } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "test:arch",
    description: "Check the app's architecture rules for actions, tRPC routers, listeners, routes, schema, app templates, translations, tests and stories.",
  },
  async run() {
    const cwd = process.cwd();
    const layout = await loadAppLayout(cwd, ARCHITECTURE_FOLDERS).catch((error: unknown) =>
      fail(`Could not load the app:\n${errorMessage(error)}`, {
        hint: "Run nuxt prepare in the app to see the error in context",
      }),
    );

    const { findings, warnings } = await lintArchitecture(cwd, layout);

    for (const warning of warnings) warn(warning);
    for (const finding of findings) error(finding);

    if (findings.length > 0) {
      fail(plural(findings.length, "architecture violation"));
    }

    success("All architecture rules pass");
  },
});
