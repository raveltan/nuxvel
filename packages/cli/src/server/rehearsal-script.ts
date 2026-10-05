import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shellScriptOf, shellVariables } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./rehearsal-scripts/", import.meta.url));
const helpersDir = fileURLToPath(new URL("./helpers/", import.meta.url));

export function rehearsalScript(step: "prepare" | "fetch" | "apply" | "clean", values: Record<string, string>) {
  const all = step === "prepare" ? { ...values, HELPER: readFileSync(`${helpersDir}rehearsal.cjs`, "utf8") } : values;

  return shellScriptOf([`${scriptsDir}${step}.sh`], ["NUXVEL_DRY_RUN=0", ...shellVariables(all)].join("\n"));
}
