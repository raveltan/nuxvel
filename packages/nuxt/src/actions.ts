import { createResolver } from "@nuxt/kit";
import type { NamedFile } from "./named-files";

const discoveredActionsModule = createResolver(import.meta.url).resolve("./runtime/server/discovery/discovered-actions");

/**
 * Builds `#nuxvel/actions`: the action each discovered `server/actions/`
 * file exports, named after the file's path, and, as `actionModules`,
 * each file's exports for `nuxvel tinker`'s scope. The server loads it at
 * boot, which is what names the actions.
 */
export function buildActionsModuleCode(definitions: NamedFile[]) {
  if (definitions.length === 0) return "export default [];\nexport const actionModules = [];";

  const imports = definitions.map(
    ({ file }, index) => `import * as actions${index} from ${JSON.stringify(file)};`,
  );
  const modules = definitions.map(
    ({ file, name }, index) => `[actions${index}, ${JSON.stringify(file)}, ${JSON.stringify(name)}]`,
  );

  return `import { discoveredActions } from ${JSON.stringify(discoveredActionsModule)};
${imports.join("\n")}

export default discoveredActions([${modules.join(", ")}]);

export const actionModules = [${definitions.map((_, index) => `actions${index}`).join(", ")}];
`;
}
