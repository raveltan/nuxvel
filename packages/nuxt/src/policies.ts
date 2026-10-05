import { createResolver } from "@nuxt/kit";

const resolver = createResolver(import.meta.url);
const definitionExportModule = resolver.resolve("./runtime/server/discovery/definition-export");
const definePolicyModule = resolver.resolve("./runtime/server/policies/define-policy");

/**
 * Builds `#nuxvel/policies`: the array of the policies the discovered
 * files export, each as its default export or as a named export whose
 * name ends with `Policy`.
 */
export function buildPoliciesModuleCode(files: string[]) {
  if (files.length === 0) return "export default [];";

  const imports = files.map(
    (file, index) => `import * as policy${index} from ${JSON.stringify(file)};`,
  );

  return `import { definitionExport } from ${JSON.stringify(definitionExportModule)};
import { isPolicy } from ${JSON.stringify(definePolicyModule)};
${imports.join("\n")}

export default [${files
    .map((file, index) => `definitionExport(policy${index}, ["Policy"], isPolicy, ${JSON.stringify(file)})`)
    .join(", ")}];`;
}
