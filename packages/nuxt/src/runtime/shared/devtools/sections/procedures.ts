import type { ReadableSchema } from "../readable-schema";

export type ProceduresSectionData = { path: string; type: string; input: ReadableSchema | null }[];
