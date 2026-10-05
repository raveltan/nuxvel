import { join } from "node:path";
import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { kebabName } from "./names.ts";

export function taskFiles(name: string, paths: AppPaths): GeneratedFile[] {
  kebabName(name, "reindex-posts");

  return [{ path: join(paths.serverDir, "tasks", `${name}.ts`), template: "task.ts.txt", values: { name } }];
}
