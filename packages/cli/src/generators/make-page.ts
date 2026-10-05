import { join } from "node:path";
import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";

export function pageFiles(name: string, paths: AppPaths): GeneratedFile[] {
  const page = name.replace(/\.vue$/, "");

  return [{ path: join(paths.pagesDir, `${page}.vue`), template: "page.vue.txt", values: { name: page } }];
}
