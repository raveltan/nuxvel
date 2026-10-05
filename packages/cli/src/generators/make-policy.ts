import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { toCamelCase } from "./case.ts";
import { definitionExport, domainFile, importFrom, kebabName, registeredName, schemaFile } from "./names.ts";

export function policyFiles(
  name: string,
  paths: AppPaths,
  template = "policy.ts.txt",
  extraValues: Record<string, string> = {},
  domain?: string,
): GeneratedFile[] {
  kebabName(name, "blog-post");

  const file = domainFile(paths.serverDir, "policies", name, "policy", domain);

  return [
    {
      path: `${file}.ts`,
      template,
      values: {
        camelName: toCamelCase(name),
        exportName: definitionExport(registeredName(name, domain), "policy"),
        schemaImport: importFrom(file, schemaFile(paths.serverDir, name, domain)),
        ...extraValues,
      },
    },
  ];
}
