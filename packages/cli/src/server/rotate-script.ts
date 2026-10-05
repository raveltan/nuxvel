import { fileURLToPath } from "node:url";
import { shellScriptOf } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./rotate-scripts/", import.meta.url));

export function rotateScript(step: "add" | "revoke", options: { deployUser: string; app: string }) {
  return shellScriptOf(
    [[`${scriptsDir}common.sh`, `${scriptsDir}${step}.sh`]],
    `NUXVEL_DRY_RUN=0
NUXVEL_DEPLOY_USER=${options.deployUser}
NUXVEL_APP=${options.app}
NUXVEL_APP_DIR=/srv/apps/${options.app}`,
  );
}
