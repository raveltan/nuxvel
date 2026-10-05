import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shellScriptOf, shellVariables } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./restore-scripts/", import.meta.url));
const helpersDir = fileURLToPath(new URL("./helpers/", import.meta.url));
const backupScriptsDir = fileURLToPath(new URL("./backup-scripts/", import.meta.url));

function variables(values: Record<string, string>) {
  return ["NUXVEL_DRY_RUN=0", ...shellVariables(values)].join("\n");
}

export function restoreScript(options: { app: string; from: string; to?: string }) {
  return shellScriptOf([`${backupScriptsDir}restore.sh`], variables({ APP: options.app, FROM: options.from, TO: options.to ?? "" }));
}

export function serverRestoreScript(
  step: "key" | "fetch" | "apply" | "clean" | "check-key",
  options: { recoveryKey?: string; from?: string; deployUser?: string; app?: string; env?: string },
) {
  const values: Record<string, string> = {
    RECOVERY_KEY: options.recoveryKey ?? "",
    FROM: options.from ?? "",
    DEPLOY_USER: options.deployUser ?? "",
    APP: options.app ?? "",
    ENV: options.env ?? "",
  };
  if (step === "fetch") values.HELPER = readFileSync(`${helpersDir}server-restore.cjs`, "utf8");

  return shellScriptOf([`${scriptsDir}${step}.sh`], variables(values));
}
