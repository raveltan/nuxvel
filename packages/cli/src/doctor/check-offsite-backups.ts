import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEPLOY_CONFIG_FILE, loadDeployConfig } from "../deploy/load-deploy-config.ts";
import { errorMessage } from "../error-message.ts";
import { type DoctorCheck, failed, passed, skipped, warning } from "./doctor-check.ts";

export const checkOffsiteBackups: DoctorCheck = {
  name: "off-site backups",
  async run({ cwd }) {
    if (!existsSync(join(cwd, DEPLOY_CONFIG_FILE))) return [skipped(`no ${DEPLOY_CONFIG_FILE}`)];

    try {
      const { environments } = await loadDeployConfig(cwd);
      const missing = Object.entries(environments).filter(([, environment]) => !environment.backups?.offsite);

      if (missing.length === 0) return [passed("every environment uploads its backups off-site")];

      return missing.map(([name]) =>
        warning(`${name} has no off-site backup target, its backups stay on its server`, `Set backups.offsite of ${name} in ${DEPLOY_CONFIG_FILE}`),
      );
    } catch (error) {
      return [failed(`could not read ${DEPLOY_CONFIG_FILE}: ${errorMessage(error)}`)];
    }
  },
};
