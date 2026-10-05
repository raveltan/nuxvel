import { join } from "node:path";
import type { AppRoutes } from "@nuxvel/nuxt/cli";
import type { GeneratedFile } from "../generated/write-generated.ts";

export function loadtestFiles(cwd: string, app: AppRoutes): GeneratedFile[] {
  const queries = app.procedures
    .filter((procedure) => procedure.type === "query")
    .map((procedure) => procedure.path)
    .sort()
    .map((path) => `  ${JSON.stringify(path)},`);

  return [
    {
      path: join(cwd, "tests", "load", "procedures.js"),
      template: "loadtest.js.txt",
      values: { procedures: queries.join("\n") },
    },
  ];
}
