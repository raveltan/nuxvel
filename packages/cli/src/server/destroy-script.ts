import { fileURLToPath } from "node:url";
import { shellScript } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./destroy-scripts/", import.meta.url));

export function destroyScript(options: { app: string; finalBackup?: boolean }) {
  return shellScript(
    scriptsDir,
    `NUXVEL_DRY_RUN=0
NUXVEL_APP=${options.app}
NUXVEL_APP_DIR=/srv/apps/${options.app}
NUXVEL_FINAL_BACKUP=${options.finalBackup === false ? 0 : 1}`,
  );
}
