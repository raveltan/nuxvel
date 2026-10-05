import { createResolver } from "@nuxt/kit";

const resolver = createResolver(import.meta.url);
const definitionExportModule = resolver.resolve("./runtime/server/discovery/definition-export");
const defineUserDataModule = resolver.resolve("./runtime/server/privacy/define-user-data");

/**
 * Builds `#nuxvel/user-data`: the array of the `defineUserData`
 * declarations the discovered files export, each as its default export
 * or as a named export whose name ends with `UserData`.
 */
export function buildUserDataModuleCode(files: string[]) {
  if (files.length === 0) return "export default [];";

  const imports = files.map(
    (file, index) => `import * as userData${index} from ${JSON.stringify(file)};`,
  );

  return `import { definitionExport } from ${JSON.stringify(definitionExportModule)};
import { isUserData } from ${JSON.stringify(defineUserDataModule)};
${imports.join("\n")}

export default [${files
    .map((file, index) => `definitionExport(userData${index}, ["UserData"], isUserData, ${JSON.stringify(file)})`)
    .join(", ")}];`;
}
