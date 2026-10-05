import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { errorMessage } from "../error-message.ts";
import { startTaskLog } from "../ui/spinner.ts";
import { runNuxtChild } from "./run-nuxt-child.ts";

function buildFailureHint(output: string) {
  if (output.includes("TSCONFIG_ERROR")) {
    return "Run nuxt prepare in the app: its tsconfig.json points at types that are not written yet";
  }

  return "Run nuxt build in the app to see the error in context";
}

export async function buildAppServer(cwd: string, dir: string, reason: string): Promise<string[] | undefined> {
  const log = startTaskLog(`Building the app's server: ${reason}`);
  let output = "";

  try {
    await runNuxtChild(join(import.meta.dirname, "build-entry.ts"), [cwd, dir], cwd, (chunk) => {
      output += chunk;
      log.write(chunk);
    });
  } catch (failure) {
    if (output === "") log.write(errorMessage(failure));
    log.fail("Could not build the app's server", buildFailureHint(output));
    return undefined;
  }

  log.done(`Built the app's server: ${reason}`);
  return z.array(z.string()).parse(JSON.parse(await readFile(join(dir, "env-reads.json"), "utf8")));
}
