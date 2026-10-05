import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shellScriptOf, shellVariables } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./deploy-scripts/", import.meta.url));

const stepFiles: Record<string, string[]> = { hold: ["hold.sh", "follow.sh"], "rollback-hold": ["signal.sh", "follow.sh"] };

export function deployScript(
  step: "lock" | "unlock" | "env" | "release" | "release-contract" | "live-routes" | "migrate" | "contract" | "switch" | "roll" | "hold" | "rollback-hold" | "failed" | "releases" | "unlock-stale" | "env-write" | "logs" | "status",
  variables: Record<string, string>,
) {
  const all = step === "hold" ? { ...variables, WATCHER: readFileSync(`${scriptsDir}hold.cjs`, "utf8") } : variables;

  const files = stepFiles[step] ?? [`${step}.sh`];

  return shellScriptOf([files.map((file) => `${scriptsDir}${file}`)], `NUXVEL_DRY_RUN=0\n${shellVariables(all).join("\n")}`);
}
