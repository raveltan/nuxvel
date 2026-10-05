import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { definitionExport, definitionFile, dottedName } from "./names.ts";

export function seederFiles(name: string, paths: AppPaths): GeneratedFile[] {
  name = dottedName(name, "blog.posts");

  return [
    {
      path: `${definitionFile(paths.serverDir, "seeders", name, "seeder")}.ts`,
      template: "seeder.ts.txt",
      values: { name, exportName: definitionExport(name, "seeder") },
    },
  ];
}
