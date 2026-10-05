import type { ReadableSchema } from "../../../src/runtime/shared/devtools/readable-schema";

function objectText(schema: ReadableSchema): string {
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(schema.properties ?? {}).map(
    ([key, value]) => `${key}${required.has(key) ? "" : "?"}: ${schemaText(value)}`,
  );

  if (fields.length === 0 && typeof schema.additionalProperties === "object") {
    return `Record<string, ${schemaText(schema.additionalProperties)}>`;
  }

  return `{ ${fields.join("; ")} }`;
}

export function schemaText(schema: ReadableSchema | boolean | null | undefined): string {
  if (schema === true) return "unknown";
  if (schema === false) return "never";
  if (!schema) return "none";
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.anyOf ?? schema.oneOf) return (schema.anyOf ?? schema.oneOf ?? []).map(schemaText).join(" | ");
  if (schema.allOf) return schema.allOf.map(schemaText).join(" & ");
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.type === "object") return objectText(schema);
  if (schema.type === "array") {
    return Array.isArray(schema.items) ? `[${schema.items.map(schemaText).join(", ")}]` : `${schemaText(schema.items)}[]`;
  }
  if (schema.type === "integer") return "number";
  if (schema.type === undefined) return "unknown";

  return schema.format ? `${schema.type} (${schema.format})` : schema.type;
}
