import type { AnyProcedure } from "@trpc/server";
import { appRouter } from "../../trpc/router";
import { defineDevtoolsSection } from "../define-devtools-section";
import { procedureInputSchema } from "../readable-schema";
import type { ProceduresSectionData } from "../../../shared/devtools/sections/procedures";

let procedures: ProceduresSectionData | undefined;

function isProcedure(value: unknown): value is AnyProcedure {
  return typeof value === "function" && "_def" in value;
}

function discoveredProcedures() {
  procedures ??=
    // tRPC types _def.procedures as the nested router record, but at runtime it is flattened by dotted path
    Object.entries(appRouter._def.procedures)
      .flatMap(([path, value]) => (isProcedure(value) ? [{ path, type: value._def.type, input: procedureInputSchema(value) }] : []))
      .sort((a, b) => a.path.localeCompare(b.path));

  return procedures;
}

export default defineDevtoolsSection<ProceduresSectionData>({
  id: "procedures",
  title: "tRPC procedures",
  order: 30,
  load: async () => discoveredProcedures(),
});
