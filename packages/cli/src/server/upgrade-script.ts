import { fileURLToPath } from "node:url";
import { shellScriptOf } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./upgrade-scripts/", import.meta.url));

export function upgradeScript(options: { reboot: boolean }) {
  return shellScriptOf([`${scriptsDir}upgrade.sh`], `NUXVEL_DRY_RUN=0\nNUXVEL_REBOOT=${options.reboot ? 1 : 0}`);
}
