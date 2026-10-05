import type { ReadableSchema } from "../../shared/devtools/readable-schema";

const SAMPLE_STRINGS: Record<string, string> = {
  email: "someone@example.com",
  uri: "https://example.com",
  url: "https://example.com",
  uuid: "00000000-0000-4000-8000-000000000000",
  "date-time": "2026-01-01T00:00:00.000Z",
  date: "2026-01-01",
};

function sampleNumber(schema: ReadableSchema) {
  if (schema.minimum !== undefined) return schema.minimum;
  if (typeof schema.exclusiveMinimum === "number") return schema.exclusiveMinimum + 1;

  return 1;
}

export function sampleInput(schema: ReadableSchema | boolean | null | undefined): unknown {
  if (typeof schema !== "object" || schema === null) return null;
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return schema.enum[0];

  const variants = schema.anyOf ?? schema.oneOf;

  if (variants) return sampleInput(variants[0]);

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  switch (type) {
    case "object":
      return Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, value]) => [key, sampleInput(value)]),
      );
    case "array":
      return Array.isArray(schema.items) ? schema.items.map(sampleInput) : [sampleInput(schema.items)];
    case "string":
      return SAMPLE_STRINGS[schema.format ?? ""] ?? "Sample";
    case "number":
    case "integer":
      return sampleNumber(schema);
    case "boolean":
      return true;
    default:
      return null;
  }
}
