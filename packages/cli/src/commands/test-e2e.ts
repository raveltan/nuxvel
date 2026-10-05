import { defineCommand } from "citty";
import { asksForHelp } from "../help-args.ts";
import { runProjectBin } from "../run-project-bin.ts";
import { startDevServices } from "../services/start-dev-services.ts";

const DEBUG_FLAGS: Record<string, Record<string, string>> = {
  "--headed": { NUXVEL_HEADED: "1" },
  "--devtools": { NUXVEL_DEVTOOLS: "1" },
  "--debug": { PWDEBUG: "1" },
};

export default defineCommand({
  meta: {
    name: "test:e2e",
    description:
      "Start the dev services, then run the project's end-to-end tests, the `e2e` project of its Vitest config (passthrough to `vitest run`, extra arguments included). With --headed, show the browser. With --devtools, show the browser with the Chrome DevTools open. With --debug, show the browser, open the Playwright inspector and turn the test timeouts off.",
  },
  async run({ rawArgs }) {
    const cwd = process.cwd();
    const isDebugFlag = (arg: string) => Object.hasOwn(DEBUG_FLAGS, arg);
    const env = Object.assign({}, ...rawArgs.filter(isDebugFlag).map((arg) => DEBUG_FLAGS[arg]));
    const vitestArgs = rawArgs.filter((arg) => !isDebugFlag(arg));

    if (!asksForHelp(rawArgs)) await startDevServices(cwd);

    process.exitCode = await runProjectBin(cwd, "vitest", ["run", "--project", "e2e", ...vitestArgs], {
      installHint: "npm i -D vitest",
      env,
    });
  },
});
