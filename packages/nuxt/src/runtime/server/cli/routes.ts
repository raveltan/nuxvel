import { writeFile } from "node:fs/promises";
import type { AnyProcedure } from "@trpc/server";
import nitroRoutes from "#nuxvel/nitro-routes";
import { routerFiles } from "#nuxvel/trpc-routers";
import { TRPC_PATH } from "../../shared/trpc/trpc-path";
import { procedureInputSchema, procedureOutputSchema } from "../devtools/readable-schema";
import { appRouter } from "../trpc/router";
import type { AppRoutes } from "./app-routes";

function isProcedure(value: unknown): value is AnyProcedure {
  return typeof value === "function" && "_def" in value;
}

function routerFile(path: string) {
  const files: Record<string, string> = routerFiles;
  const namespace = Object.keys(files)
    .filter((candidate) => `${path}.`.startsWith(`${candidate}.`))
    .sort((a, b) => b.length - a.length)[0];

  return namespace === undefined ? "@nuxvel/nuxt" : (files[namespace] ?? "");
}

export function appProcedures() {
  // tRPC types _def.procedures as the nested router record, but at runtime it is flattened by dotted path
  return Object.entries(appRouter()._def.procedures).flatMap(([path, value]) =>
    isProcedure(value) ? [{ path, type: value._def.type, procedure: value }] : [],
  );
}

export async function runRoutes(outFile: string): Promise<number> {
  const procedures = appProcedures().map(({ path, type, procedure }) => ({
    path,
    route: `${TRPC_PATH}/${path}`,
    type,
    file: routerFile(path),
    input: procedureInputSchema(procedure),
    output: procedureOutputSchema(procedure),
  }));
  const routes: AppRoutes = { procedures, handlers: nitroRoutes };

  await writeFile(outFile, JSON.stringify(routes));

  return 0;
}
