import { fileURLToPath } from "node:url";
import { shellScriptOf } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./backup-scripts/", import.meta.url));

export function backupScript(options: { app: string }) {
  return shellScriptOf([`${scriptsDir}backup.sh`], `NUXVEL_DRY_RUN=0\nNUXVEL_APP=${options.app}`);
}
