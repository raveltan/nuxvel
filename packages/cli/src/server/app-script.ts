import { fileURLToPath } from "node:url";
import { shellQuote, shellScript } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./app-scripts/", import.meta.url));

export function appScript(options: {
  dryRun: boolean;
  deployUser: string;
  app: string;
  domains: string[];
  redirects: Record<string, string>;
  filesDomain: string | undefined;
  restoreDrill: boolean;
}) {
  return shellScript(
    scriptsDir,
    `NUXVEL_DRY_RUN=${options.dryRun ? 1 : 0}
NUXVEL_DEPLOY_USER=${options.deployUser}
NUXVEL_APP=${options.app}
NUXVEL_APP_DIR=/srv/apps/${options.app}
NUXVEL_DOMAINS="${options.domains.join(" ")}"
NUXVEL_REDIRECTS=${shellQuote(JSON.stringify(options.redirects))}
NUXVEL_FILES_DOMAIN=${options.filesDomain ?? ""}
NUXVEL_RESTORE_DRILL=${options.restoreDrill ? 1 : 0}`,
  );
}
