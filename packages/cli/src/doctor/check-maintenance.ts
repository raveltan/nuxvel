import { maintenanceListingSchema } from "@nuxvel/nuxt/cli";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { errorMessage } from "../error-message.ts";
import { appSettings, usesNuxvel } from "./app-settings.ts";
import { type DoctorCheck, failed, passed, skipped, warning } from "./doctor-check.ts";

export const checkMaintenance: DoctorCheck = {
  name: "maintenance",
  async run({ cwd }) {
    const { checkEnvironment } = await import("@nuxvel/nuxt/env");

    if (checkEnvironment(await appSettings(cwd)).length > 0) return [skipped("the environment is invalid")];

    try {
      if (!(await usesNuxvel(cwd))) return [skipped("the app does not use @nuxvel/nuxt")];

      const status = await loadFromApp(cwd, (outFile) => ({ kind: "maintenance:status", outFile }), maintenanceListingSchema);

      if (!status) return [failed("could not check maintenance mode: the app's server did not run the check")];

      if (!status.down) return [passed("the app is up")];

      return [warning(`the app is down for maintenance since ${status.since}`, "Run nuxvel up when the work is done")];
    } catch (error) {
      return [failed(`could not check maintenance mode: ${errorMessage(error)}`)];
    }
  },
};
