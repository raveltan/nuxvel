import { fileURLToPath } from "node:url";
import { shellScriptOf } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./alert-scripts/", import.meta.url));

export function alertTestScript() {
  return shellScriptOf([`${scriptsDir}test.sh`], "NUXVEL_DRY_RUN=0");
}
