import { resolveProjectBin } from "../project-bin.ts";
import { runCaptured } from "../run-captured.ts";
import { startTaskLog } from "../ui/spinner.ts";

export async function runNuxiPrepare(cwd: string) {
  const log = startTaskLog("Updating types (nuxt prepare)");
  const nuxt = resolveProjectBin(cwd, "nuxt");
  const code = nuxt ? await runCaptured(cwd, process.execPath, [nuxt, "prepare"], log) : "missing";

  if (code === "missing") log.fail("Could not run nuxt prepare", "Install nuxt in this project (npm i nuxt)");
  else if (code !== 0) log.fail(`nuxt prepare exited with code ${code}`);
  else log.done("Updated types (nuxt prepare)");

  return code === 0;
}
