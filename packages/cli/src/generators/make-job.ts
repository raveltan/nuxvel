import { type AppPaths, rootPathFrom } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { inputFieldValues } from "./fields.ts";
import { definitionExport, definitionFile, domainName, dottedName } from "./names.ts";

export function jobFiles(name: string, paths: AppPaths, domain?: string, input = inputFieldValues([], "json")): GeneratedFile[] {
  name = domainName(dottedName(name, "post.notify-subscribers"), domain);

  const jobFile = definitionFile(paths.serverDir, "jobs", name, "job", domain);
  const values = { name, exportName: definitionExport(name, "job"), rootPath: rootPathFrom(`${jobFile}.ts`, paths.rootDir), ...input };

  return [
    { path: `${jobFile}.ts`, template: "job.ts.txt", values },
    { path: `${jobFile}.test.ts`, template: "job-test.ts.txt", values },
  ];
}
