import { createResolver } from "@nuxt/kit";
import { exportSuffixes, type NamedFile } from "./named-files";

const resolver = createResolver(import.meta.url);
const definitionNameModule = resolver.resolve("./runtime/server/discovery/definition-name");
const definitionExportModule = resolver.resolve("./runtime/server/discovery/definition-export");
const aliasesModule = resolver.resolve("./runtime/server/discovery/aliases");

/**
 * Builds a `#nuxvel/*` registry module: the array of the definitions the
 * discovered files of `folder` export, each given its path's name as a
 * literal, so the registry's name union is exact. A file exports its
 * definition as the default export or as a named export with the kind
 * suffix of `folder` (`postNotifySubscribersJob`). With `refuseRenamedAs`,
 * the kind (e.g. `"mail"`) stores nothing under its names, and a
 * `renamed()` alias among the files stops the server as the module
 * loads.
 */
export function buildDiscoveredModuleCode(folder: string, definitions: NamedFile[], refuseRenamedAs?: string) {
  if (definitions.length === 0) return "export default [];";

  const suffixes = JSON.stringify(exportSuffixes(folder));
  const imports = definitions.map(
    ({ file }, index) => `import * as definition${index} from ${JSON.stringify(file)};`,
  );
  const entries = `[${definitions
    .map(
      ({ file, name }, index) =>
        `named(definitionExport(definition${index}, ${suffixes}, isDefinition, ${JSON.stringify(file)}), ${JSON.stringify(name)}, ${JSON.stringify(file)})`,
    )
    .join(", ")}]`;
  const header = `import { isDefinition, named } from ${JSON.stringify(definitionNameModule)};
import { definitionExport } from ${JSON.stringify(definitionExportModule)};`;

  if (refuseRenamedAs === undefined) {
    return `${header}
${imports.join("\n")}

export default ${entries};
`;
  }

  return `${header}
import { refuseRenamed } from ${JSON.stringify(aliasesModule)};
${imports.join("\n")}

export default refuseRenamed(${JSON.stringify(refuseRenamedAs)}, ${entries});
`;
}
