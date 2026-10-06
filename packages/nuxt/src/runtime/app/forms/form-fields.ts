import { z } from "zod";
import { richTextMarker } from "../../shared/ugc/rich-text-schemas";

export interface FormField {
  name: string;
  input: string | undefined;
  items: string[];
  upload: string | undefined;
  dateAsString: boolean;
  optional: boolean;
  nullable: boolean;
}

const wrappers = new Set(["optional", "nullable", "default", "prefault", "readonly", "nonoptional", "catch"]);

function innerSchema(schema: z.ZodType): z.ZodType | undefined {
  const def: { type: string; innerType?: z.ZodType; in?: z.ZodType } = schema.def;
  if (wrappers.has(def.type)) return def.innerType;
  if (def.type === "pipe") return def.in;
  return undefined;
}

function baseInput(schema: z.ZodType) {
  if (richTextMarker in schema) return "richText";
  const type = schema.def.type;
  if (type === "string") {
    const format = "format" in schema ? schema.format : undefined;
    return format === "email" || format === "url" || format === "date" ? format : "text";
  }
  if (type === "enum") return "select";
  if (type === "boolean" || type === "number" || type === "date") return type;
  return undefined;
}

function formField(name: string, field: z.ZodType): FormField {
  let schema: z.ZodType | undefined = field;
  let input: string | undefined;
  let upload: string | undefined;
  let optional = false;
  let nullable = false;

  while (schema) {
    const type = schema.def.type;
    optional ||= type === "optional" || type === "default" || type === "prefault";
    nullable ||= type === "nullable";
    const meta = schema.meta();
    input ??= meta?.input;
    upload ??= meta?.upload;
    const base = baseInput(schema);
    if (base || !innerSchema(schema)) {
      const items = schema instanceof z.ZodEnum ? schema.options.map(String) : [];
      return {
        name,
        input: input ?? (upload ? "upload" : base),
        items,
        upload,
        dateAsString: base === "date" && schema.def.type === "string",
        optional,
        nullable,
      };
    }
    schema = innerSchema(schema);
  }

  return { name, input, items: [], upload, dateAsString: false, optional, nullable };
}

export function formFields(schema: z.ZodType): FormField[] {
  if (!(schema instanceof z.ZodObject)) return [];
  return Object.entries(schema.shape).map(([name, field]) => formField(name, field));
}

export function humanize(name: string) {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
