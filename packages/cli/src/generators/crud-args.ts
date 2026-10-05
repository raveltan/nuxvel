import { searchableColumns } from "./make-schema.ts";

export const fieldsArg = {
  fields: {
    type: "positional",
    description:
      "Fields as name[:type[=arg]][:modifier...], e.g. title body:text status:enum=draft,published author:references=user:nullable. The type is string if you do not write it.",
    required: false,
  },
} as const;

export const tableArgs = {
  "soft-deletes": {
    type: "boolean",
    description: "Add a softDeletes() deleted_at column.",
    default: false,
  },
  searchable: {
    type: "string",
    description: "Add these text columns, comma-separated, with a full-text search index, e.g. title,body.",
  },
} as const;

export const crudArgs = {
  ...tableArgs,
  "soft-deletes": {
    ...tableArgs["soft-deletes"],
    description: "Add a softDeletes() deleted_at column, and delete and restore actions and procedures.",
  },
  openapi: {
    type: "boolean",
    description: "Expose every procedure as a REST endpoint with .meta({ openapi }) and output schemas. Turn it off with --no-openapi.",
    default: true,
  },
} as const;

export function crudOptions(args: { "soft-deletes": boolean; searchable?: string; openapi?: boolean; ui?: boolean }) {
  return {
    softDeletes: args["soft-deletes"],
    searchable: searchableColumns(args.searchable),
    openapi: args.openapi ?? true,
    ui: args.ui ?? false,
  };
}
