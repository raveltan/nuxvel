import { mkdtempSync, rmSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { defineCommand } from "citty";
import { selectChangedTests, skipsFolder } from "../changed-tests.ts";
import { asksForHelp } from "../help-args.ts";
import { runProjectBin } from "../run-project-bin.ts";
import { startDevServices } from "../services/start-dev-services.ts";
import { report, symbols } from "../ui/output.ts";

const CHANGES_ONLY = "--changes-only";
const WATCH = "--watch";
const WATCH_SETTLE_MS = 100;

async function runChangedTests(cwd: string, vitestArgs: string[]) {
  const selection = selectChangedTests(cwd);
  const args = [...vitestArgs];

  if ("runAll" in selection) {
    report(`${symbols.step} Run all test files: ${selection.runAll}`);
  } else {
    report(`${symbols.step} Test files replayed as passed: ${selection.replayed}. Test files to run: ${selection.files.length}.`);
    if (selection.files.length === 0) return 0;
    args.push("--passWithNoTests", ...selection.files);
  }

  const changesDir = mkdtempSync(join(tmpdir(), "nuxvel-changes-"));
  try {
    return await runProjectBin(
      cwd,
      "vitest",
      [...args, "--reporter=default", "--reporter=@nuxvel/nuxt/testing/changes-reporter"],
      { installHint: "npm i -D vitest", env: { NUXVEL_CHANGES_DIR: changesDir } },
    );
  } finally {
    rmSync(changesDir, { recursive: true, force: true });
  }
}

export default defineCommand({
  meta: {
    name: "test",
    description:
      "Start the dev services, then run the project's functional tests, the `functional` project of its Vitest config (passthrough to `vitest run`, extra arguments included). With --changes-only, run only the test files that the changes since the last --changes-only run affect. With --watch, do the --changes-only steps again each time a project file changes.",
  },
  async run({ rawArgs }) {
    const cwd = process.cwd();
    const changesOnly = rawArgs.includes(CHANGES_ONLY);
    const watchMode = rawArgs.includes(WATCH);
    const vitestArgs = ["run", "--project", "functional", ...rawArgs.filter((arg) => arg !== CHANGES_ONLY && arg !== WATCH)];

    if (!changesOnly && !watchMode) {
      if (!asksForHelp(rawArgs)) await startDevServices(cwd);
      process.exitCode = await runProjectBin(cwd, "vitest", vitestArgs, { installHint: "npm i -D vitest" });
      return;
    }

    await startDevServices(cwd);

    if (!watchMode) {
      process.exitCode = await runChangedTests(cwd, vitestArgs);
      return;
    }

    let running = false;
    let pending = false;
    const runUntilIdle = async () => {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      do {
        pending = false;
        await runChangedTests(cwd, vitestArgs);
      } while (pending);
      running = false;
      report(`${symbols.step} Wait for file changes. Push Ctrl-C to stop.`);
    };

    let settle: NodeJS.Timeout | undefined;
    await runUntilIdle();
    watch(cwd, { recursive: true }, (_event, file) => {
      if (!file || file.split(sep).slice(0, -1).some(skipsFolder)) return;
      clearTimeout(settle);
      settle = setTimeout(() => void runUntilIdle(), WATCH_SETTLE_MS);
    });
  },
});
