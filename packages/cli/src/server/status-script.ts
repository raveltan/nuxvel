import { fileURLToPath } from "node:url";
import { shellScriptOf } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./status-scripts/", import.meta.url));

export function statusScript(options: { deployUser: string }) {
  return shellScriptOf([`${scriptsDir}status.sh`], `NUXVEL_DRY_RUN=0\nNUXVEL_DEPLOY_USER=${options.deployUser}`);
}
