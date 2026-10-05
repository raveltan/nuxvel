import type { AnyProcedure } from "@trpc/server";
import { z } from "zod";
import type { ReadableSchema } from "../../shared/devtools/readable-schema";

export function readableSchema(schema: unknown, io: "input" | "output" = "input"): ReadableSchema | null {
  if (!(schema instanceof z.ZodType)) return null;

  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema, { io, unrepresentable: "any" });

  return jsonSchema;
}

export function procedureInputSchema(procedure: AnyProcedure): ReadableSchema | null {
  const inputs = procedure._def.inputs;

  if (inputs.length === 0) return null;
  if (inputs.length === 1) return readableSchema(inputs[0]);

  return { allOf: inputs.map((input) => readableSchema(input)).filter((schema) => schema !== null) };
}

export function procedureOutputSchema(procedure: AnyProcedure): ReadableSchema | null {
  return readableSchema(Reflect.get(procedure._def, "output"), "output");
}
