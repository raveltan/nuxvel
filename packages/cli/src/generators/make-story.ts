import { basename, join } from "node:path";
import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { requireFile } from "./names.ts";

export function storyFiles(name: string, paths: AppPaths): GeneratedFile[] {
  const component = join(paths.componentsDir, name.replace(/\.vue$/, ""));
  requireFile(paths.rootDir, `${component}.vue`, "Pass the path of a component under app/components/, without .vue, e.g. base/Button");
  const file = basename(component);
  const identifier = file.replace(/(?:^|[-_.])(\w)/g, (_, letter: string) => letter.toUpperCase());

  return [{ path: `${component}.stories.ts`, template: "story.ts.txt", values: { file, component: identifier } }];
}
