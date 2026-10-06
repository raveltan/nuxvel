import { type AppPaths, rootPathFrom } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { toPascalCase } from "./case.ts";
import { definitionExport, definitionFile, importFrom, schemaFile } from "./names.ts";

export function actionFiles(
  domain: string,
  name: string,
  paths: AppPaths,
  options: { template?: string; withTest?: boolean; values?: Record<string, string>; domainFolder?: boolean } = {},
): GeneratedFile[] {
  const file = definitionFile(paths.serverDir, "actions", `${domain}.${name}`, "action", options.domainFolder ? domain : undefined);
  const values = {
    domain,
    name,
    exportName: definitionExport(name, "action"),
    pascalName: toPascalCase(name),
    rootPath: rootPathFrom(`${file}.ts`, paths.rootDir),
    authSchemaPath: importFrom(file, schemaFile(paths.appServerDir, "auth")),
    sample: "{}",
    ...options.values,
  };
  const schema = options.values?.schema;
  const withInput = schema !== undefined && schema !== "z.object({})";
  const rendered = {
    ...values,
    zodImport: withInput ? 'import { z } from "zod";\n\n' : "",
    inputLine: withInput ? `  input: ${schema},\n` : "",
  };
  const files: GeneratedFile[] = [{ path: `${file}.ts`, template: options.template ?? "action.ts.txt", values: rendered }];

  if (options.withTest ?? true) {
    files.push({ path: `${file}.test.ts`, template: "action-test.ts.txt", values });
  }

  return files;
}
