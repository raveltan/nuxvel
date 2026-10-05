import { type OrphanedNames, orphanedNamesSchema } from "@nuxvel/nuxt/cli";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { errorMessage } from "../error-message.ts";
import { appSettings, usesNuxvel } from "./app-settings.ts";
import { type DoctorCheck, failed, passed, skipped } from "./doctor-check.ts";

function describe({ kind, name, count }: OrphanedNames[number]) {
  const times = count > 1 ? ` (${count})` : "";

  return `${kind} "${name}"${times} is stored under a name nothing defines`;
}

export const checkOrphanedNames: DoctorCheck = {
  name: "stored names",
  async run({ cwd }) {
    const { checkEnvironment } = await import("@nuxvel/nuxt/env");

    if (checkEnvironment(await appSettings(cwd)).length > 0) return [skipped("the environment is invalid")];

    try {
      if (!(await usesNuxvel(cwd))) return [skipped("the app does not use @nuxvel/nuxt")];

      const orphans = await loadFromApp(cwd, (outFile) => ({ kind: "orphaned-names", outFile }), orphanedNamesSchema);

      if (!orphans) return [failed("could not check stored names: the app's server did not run the check")];

      if (orphans.length === 0) return [passed("nothing stored under an undefined name")];

      return orphans.map((orphan, index) =>
        failed(describe(orphan), index === orphans.length - 1 ? "Keep a renamed() alias at the old path, or remove it" : undefined),
      );
    } catch (error) {
      return [failed(`could not check stored names: ${errorMessage(error)}`)];
    }
  },
};
