import { join } from "node:path";
import { addTemplate, resolveFiles } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import { DISCOVERY_IGNORE } from "../named-files";
import { buildProcedureInputsModuleCode, procedureInputs } from "../procedure-inputs";
import type { Discovery } from "./discovery";

const FILENAME = "nuxvel/procedure-inputs";

export function addProcedureInputs(nuxt: Nuxt, { discoverLayers, discoverNamed, layerDirectories }: Discovery) {
  const schemaDirs = layerDirectories.map((dirs) => join(dirs.shared, "schemas"));
  const inputs = async () =>
    procedureInputs(
      await discoverLayers("trpc/routers"),
      await discoverNamed("action", "actions"),
      (await Promise.all(schemaDirs.map((dir) => resolveFiles(dir, "**/*.ts", { ignore: DISCOVERY_IGNORE })))).flat(),
    );

  addTemplate({ filename: `${FILENAME}.mjs`, write: true, getContents: async () => buildProcedureInputsModuleCode(await inputs(), false) });
  addTemplate({ filename: `${FILENAME}.d.ts`, write: true, getContents: async () => buildProcedureInputsModuleCode(await inputs(), true) });
  nuxt.options.alias["#nuxvel/procedure-inputs"] = join(nuxt.options.buildDir, FILENAME);
}
