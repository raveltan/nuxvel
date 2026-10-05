import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEPLOY_CONFIG_FILE, loadDeployConfig } from "../deploy/load-deploy-config.ts";
import { REHEARSALS_FILE, readRehearsals } from "../deploy/rehearsal-record.ts";
import { errorMessage } from "../error-message.ts";
import { type DoctorCheck, failed, passed, skipped, warning } from "./doctor-check.ts";

const MAX_AGE_DAYS = 90;
const DAY_MS = 86_400_000;

export const checkRestoreRehearsal: DoctorCheck = {
  name: "restore rehearsal",
  async run({ cwd }) {
    if (!existsSync(join(cwd, DEPLOY_CONFIG_FILE))) return [skipped(`no ${DEPLOY_CONFIG_FILE}`)];

    try {
      const { environments } = await loadDeployConfig(cwd);
      const rehearsals = readRehearsals(cwd);
      const backedUp = Object.entries(environments).filter(([, environment]) => environment.backups?.offsite).map(([name]) => name);

      if (backedUp.length === 0) return [skipped("no environment uploads its backups off-site")];

      return backedUp.map((name) => {
        const rehearsal = rehearsals[name];
        const other = Object.keys(environments).find((candidate) => candidate !== name) ?? "<env>";
        const hint = `Run nuxvel server:restore ${other} --from=${name}:latest, and commit ${REHEARSALS_FILE}`;
        if (!rehearsal) return warning(`the restore of ${name} was never rehearsed`, hint);

        const days = Math.floor((Date.now() - Date.parse(rehearsal.time)) / DAY_MS);
        if (days > MAX_AGE_DAYS) return warning(`the restore of ${name} was last rehearsed ${days} days ago, more than ${MAX_AGE_DAYS}`, hint);

        return passed(`the restore of ${name} was rehearsed ${days} days ago on ${rehearsal.on}, in ${rehearsal.minutes} min`);
      });
    } catch (error) {
      return [failed(`could not read the rehearsals: ${errorMessage(error)}`)];
    }
  },
};
