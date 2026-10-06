import { existsSync, readFileSync } from "node:fs";
import { basename, relative, sep } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { AppPaths } from "../app-layout/app-paths.ts";
import { loadAppLayout } from "../app-layout/load-app-layout.ts";
import { fail } from "../ui/fail.ts";
import { toCamelCase, toSnakeCase } from "./case.ts";
import { importTable, indexAppFactories } from "./factory-sync.ts";
import { domainFile, importFrom, registeredName, schemaFile } from "./names.ts";

type Reference = {
  file: string;
  table: string;
  id: "integer" | "text" | "uuid";
  owned: boolean;
  factory?: { file: string; name: string };
  requiredReferences: string[];
  list?: { rows: string; trpcPath: string; label: string };
};
type AppFactories = ReturnType<typeof indexAppFactories>;

export interface Field {
  spec: string;
  key: string;
  column: string;
  type: string;
  arg: string[];
  nullable: boolean;
  unique: boolean;
  index: boolean;
  defaultValue?: string;
  target?: string;
  reference?: Reference;
}

interface FieldType {
  pg: string;
  arg?: "optional" | "required";
  column: (column: string, arg: string[]) => string;
  zod: (arg: string[]) => string;
  row?: string;
  sample: (arg: string[]) => string;
  literal?: (value: string, arg: string[]) => string | undefined;
  control?: (model: string, arg: string[], nullable: boolean) => string;
  empty: (arg: string[]) => string;
}

const quoted = (value: string) => JSON.stringify(value);
const whole = (value: string) => (/^-?\d+$/.test(value) ? value : undefined);
const decimalPattern = /^-?\d+(\.\d+)?$/;
const varchar = (column: string) => `varchar("${column}", { length: 255 })`;

const vModel = (model: string, nullable: boolean) => `v-model${nullable ? ".nullable" : ""}="${model}"`;
const input = (attributes = "") => (model: string, _arg: string[], nullable: boolean) => `<UInput ${vModel(model, nullable)}${attributes} class="w-full" />`;
const number = (model: string) => `<UInputNumber v-model="${model}" class="w-full" />`;

const fieldTypes: Record<string, FieldType> = {
  string: { pg: "varchar", column: varchar, zod: () => "z.string().trim().min(1).max(255)", sample: () => '"Sample text"', literal: quoted, control: input(), empty: () => '""' },
  text: {
    pg: "text",
    column: (column) => `text("${column}")`,
    zod: () => "z.string().trim().min(1)",
    sample: () => '"Sample text"',
    literal: quoted,
    control: (model, _arg, nullable) => `<UTextarea ${vModel(model, nullable)} class="w-full" />`,
    empty: () => '""',
  },
  email: { pg: "varchar", column: varchar, zod: () => "z.email().max(255)", sample: () => '"sample@example.com"', literal: quoted, control: input(' type="email"'), empty: () => '""' },
  integer: { pg: "integer", column: (column) => `integer("${column}")`, zod: () => "z.number().int()", row: "z.number()", sample: () => "1", literal: whole, control: number, empty: () => "0" },
  bigint: { pg: "bigint", column: (column) => `bigint("${column}", { mode: "number" })`, zod: () => "z.number().int()", row: "z.number()", sample: () => "1", literal: whole, control: number, empty: () => "0" },
  boolean: {
    pg: "boolean",
    column: (column) => `boolean("${column}")`,
    zod: () => "z.boolean()",
    row: "z.boolean()",
    sample: () => "true",
    literal: (value) => (value === "true" || value === "false" ? value : undefined),
    control: (model) => `<UCheckbox v-model="${model}" />`,
    empty: () => "false",
  },
  decimal: {
    pg: "numeric",
    arg: "optional",
    column: (column, [precision = "10", scale = "2"]) => `numeric("${column}", { precision: ${precision}, scale: ${scale} })`,
    zod: () => `z.string().regex(${decimalPattern})`,
    sample: () => '"1.5"',
    literal: (value) => (decimalPattern.test(value) ? quoted(value) : undefined),
    control: input(' inputmode="decimal"'),
    empty: () => '""',
  },
  uuid: { pg: "uuid", column: (column) => `uuid("${column}")`, zod: () => "z.uuid()", sample: () => '"123e4567-e89b-42d3-a456-426614174000"', control: input(), empty: () => '""' },
  date: { pg: "date", column: (column) => `date("${column}")`, zod: () => "z.iso.date()", sample: () => '"2026-01-31"', control: input(' type="date"'), empty: () => '""' },
  timestamp: {
    pg: "timestamp",
    column: (column) => `timestamp("${column}")`,
    zod: () => "z.date()",
    row: "z.date()",
    sample: () => 'new Date("2026-01-31T12:00:00Z")',
    control: (model, _arg, nullable) =>
      `<ClientOnly><UInput type="datetime-local" :model-value="${model} ? new Date(${model}.getTime() - ${model}.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''" class="w-full" @update:model-value="${model} = ${nullable ? "$event ? " : ""}new Date($event)${nullable ? " : null" : ""}" /></ClientOnly>`,
    empty: () => "new Date()",
  },
  json: { pg: "jsonb", column: (column) => `jsonb("${column}")`, zod: () => "z.json()", row: "z.unknown()", sample: () => "{ sample: true }", empty: () => "{}" },
  enum: {
    pg: "text",
    arg: "required",
    column: (column, values) => `text("${column}", { enum: [${values.map(quoted).join(", ")}] })`,
    zod: (values) => `z.enum([${values.map(quoted).join(", ")}])`,
    sample: ([first = ""]) => quoted(first),
    literal: (value, values) => (values.includes(value) ? quoted(value) : undefined),
    control: (model, values, nullable) => `<USelect ${vModel(model, nullable)} :items="[${values.map((value) => `'${value}'`).join(", ")}]" class="w-full" />`,
    empty: ([first = ""]) => quoted(first),
  },
  references: { pg: "", arg: "optional", column: () => "", zod: () => "", sample: () => "", empty: () => "" },
};

const referenceIds = {
  integer: "z.number().int().positive()",
  text: "z.string().min(1)",
  uuid: "z.uuid()",
};

const reservedKeys = ["id", "createdAt", "updatedAt", "deletedAt", "ownerId", "searchVector"];
const modifiers = ["nullable", "unique", "index", "default"];
const typeNames = Object.keys(fieldTypes).join(", ");

function invalid(spec: string, message: string, hint: string): never {
  fail(`"${spec}": ${message}`, { hint });
}

function parseArg(spec: string, type: string, arg: string | undefined) {
  const kind = fieldTypes[type]?.arg;
  const values = arg === undefined ? [] : arg.split(",").map((value) => value.trim());

  if (arg !== undefined && !kind) invalid(spec, `the type ${type} takes no argument`, `Write it as ${type} without "="`);
  if (kind === "required" && (values.length === 0 || values.some((value) => value === ""))) {
    invalid(spec, "the type enum needs its values", "Write the values after the type, e.g. status:enum=draft,published");
  }
  if (type === "decimal" && arg !== undefined && (values.length !== 2 || !values.every((value) => /^\d+$/.test(value)))) {
    invalid(spec, "the type decimal takes a precision and a scale", "Write two numbers, e.g. price:decimal=10,2");
  }
  if (type === "references" && values.length > 1) {
    invalid(spec, "the type references takes one table", "Write one table name, e.g. author:references=user");
  }

  return values;
}

function parseField(spec: string): Field {
  const [name = "", ...rest] = spec.split(":");
  const typeSegment = rest[0] !== undefined && !modifiers.includes(rest[0].split("=")[0] ?? "") ? rest.shift() : undefined;
  const [type = "string", arg] = (typeSegment ?? "string").split(/=(.*)/s);

  if (!/^[a-z][a-zA-Z0-9_]*$/.test(name)) {
    invalid(spec, `"${name}" is not a valid field name`, "Start the name with a lowercase letter, e.g. title or due_at");
  }
  if (!fieldTypes[type]) invalid(spec, `"${type}" is not a known type`, `Use one of: ${typeNames}`);

  const snake = toSnakeCase(name.replace(/([A-Z])/g, "_$1"));
  const references = type === "references";
  const base = references ? snake.replace(/_id$/, "") : snake;
  const column = references ? `${base}_id` : base;
  const field: Field = {
    spec,
    key: toCamelCase(column),
    column,
    type,
    arg: parseArg(spec, type, arg),
    nullable: false,
    unique: false,
    index: false,
  };

  if (references) field.target = field.arg[0] ?? base.replaceAll("_", "-");

  for (const modifier of rest) {
    const [key = "", value] = modifier.split(/=(.*)/s);

    if (key === "default" && value !== undefined) {
      const literal = fieldTypes[type]?.literal?.(value, field.arg);
      if (literal === undefined) {
        invalid(spec, `"${value}" is not a valid default for the type ${type}`, "Give a value of the field's type. The types uuid, date, timestamp, json and references take no default");
      }
      field.defaultValue = literal;
    } else if ((key === "nullable" || key === "unique" || key === "index") && value === undefined) {
      field[key] = true;
    } else {
      invalid(spec, `"${modifier}" is not a known modifier`, "Use nullable, unique, index or default=<value>");
    }
  }

  if (reservedKeys.includes(field.key)) {
    invalid(spec, `the name ${field.key} is reserved`, `Use a different name. These names are reserved: ${reservedKeys.join(", ")}`);
  }

  return field;
}

export function parseFields(specs: string[], taken: string[] = []) {
  const fields = specs.map(parseField);
  const keys = [...taken.map(toCamelCase)];

  for (const field of fields) {
    if (keys.includes(field.key)) invalid(field.spec, `the field ${field.key} occurs two times`, "Give each field a different name");
    keys.push(field.key);
  }

  return fields;
}

async function searchSchemas(paths: AppPaths, target: string) {
  const layout = await loadAppLayout(paths.rootDir, ["database/schema"]);
  const matches = (layout.files["database/schema"] ?? []).filter((file) => [`${target}.schema.ts`, `${target}.ts`].includes(basename(file)));
  const [match] = matches;

  if (!match) fail(`The table ${target} does not exist`, { hint: `Create it first: nuxvel make:schema ${target}` });
  if (matches.length > 1) {
    fail(`The table ${target} is in more than one place: ${matches.map((file) => relative(paths.rootDir, file)).join(", ")}`, {
      hint: "Rename one of the tables",
    });
  }

  return {
    file: match.replace(/\.ts$/, ""),
    serverDir: layout.serverDirs.find((dir) => match.startsWith(`${dir}${sep}`)) ?? paths.serverDir,
  };
}

async function resolveReference(paths: AppPaths, target: string, domain: string | undefined, factories: () => AppFactories): Promise<Reference> {
  const candidates = [
    ...(domain ? [schemaFile(paths.serverDir, target, domain)] : []),
    schemaFile(paths.serverDir, target),
    ...(target === "user" ? [schemaFile(paths.appServerDir, "auth")] : []),
  ];
  const known = candidates.find((candidate) => existsSync(`${candidate}.ts`));
  const found = known ? { file: known, serverDir: paths.serverDir } : await searchSchemas(paths, target);
  const { file, serverDir } = found;

  const table = `${toCamelCase(target)}Table`;
  const loaded = await importTable(file, table);
  const columns = loaded ? getTableColumns(loaded) : undefined;
  const id = columns?.id;

  if (!loaded || !id) fail(`${relative(paths.rootDir, file)}.ts does not export ${table} with an id column`, { hint: "Point references at a table made with nuxvel make:schema" });

  const sqlType = id.getSQLType();
  const factory = (await factories()).find((candidate) => candidate.table === loaded);
  const foreignKeys = getTableConfig(loaded).foreignKeys.flatMap((foreignKey) => foreignKey.reference().columns);
  const owner = file.match(/[\\/]domains[\\/]([^\\/]+)[\\/]schema[\\/][^\\/]+$/)?.[1];
  const routerDomain = owner ?? (domain && file === candidates[0] ? domain : undefined);
  const router = `${domainFile(serverDir, "trpc/routers", target, "router", routerDomain)}.ts`;
  const label = Object.entries(getTableColumns(loaded)).find(
    ([, column]) => (column.columnType === "PgVarchar" || column.columnType === "PgText") && !foreignKeys.includes(column),
  )?.[0];

  return {
    file,
    table,
    id: id.dataType === "number" ? "integer" : sqlType === "uuid" ? "uuid" : "text",
    owned: columns?.ownerId !== undefined,
    factory: factory && { file: factory.file.replace(/\.ts$/, ""), name: factory.name },
    list:
      existsSync(router) && /\blist:/.test(readFileSync(router, "utf-8"))
        ? {
            rows: `${toCamelCase(target)}Rows`,
            trpcPath: registeredName(target, routerDomain).split(".").map(toCamelCase).join("."),
            label: label ?? "id",
          }
        : undefined,
    requiredReferences: foreignKeys
      .filter((column) => column.notNull && !column.hasDefault && column !== columns?.ownerId)
      .map((column) => column.name),
  };
}

export async function withReferences(fields: Field[], paths: AppPaths, domain?: string) {
  let index: AppFactories | undefined;
  const factories = () => (index ??= indexAppFactories(paths.serverDir, paths.rootDir));

  return Promise.all(
    fields.map(async (field) => (field.target ? { ...field, reference: await resolveReference(paths, field.target, domain, factories) } : field)),
  );
}

function fieldColumn(field: Field) {
  const type = fieldTypes[field.type];
  const reference = field.reference;
  const base = reference ? `${reference.id}("${field.column}")` : (type?.column(field.column, field.arg) ?? "");

  return [
    base,
    field.nullable ? "" : ".notNull()",
    field.unique ? ".unique()" : "",
    field.defaultValue === undefined ? "" : `.default(${field.defaultValue})`,
    reference ? `.references(() => ${reference.table}.id, { onDelete: "${field.nullable ? "set null" : "cascade"}" })` : "",
  ].join("");
}

function fieldRowZod(field: Field) {
  const type = fieldTypes[field.type];
  const reference = field.reference && (field.reference.id === "integer" ? "z.number()" : "z.string()");
  const zod = reference ?? (field.type === "enum" ? type?.zod(field.arg) : type?.row) ?? "z.string()";

  return `${zod}${field.nullable ? ".nullable()" : ""}`;
}

function fieldZod(field: Field) {
  const zod = field.reference ? referenceIds[field.reference.id] : (fieldTypes[field.type]?.zod(field.arg) ?? "");

  return `${zod}${field.nullable ? ".nullish()" : field.defaultValue === undefined ? "" : ".optional()"}`;
}

export function referenceFactory(reference: Reference) {
  return reference.table.replace(/Table$/, "Factory");
}

export function fieldSample(field: Field) {
  return field.reference ? `(await ${referenceFactory(field.reference)}()).id` : (fieldTypes[field.type]?.sample(field.arg) ?? "");
}

export function fieldControl(field: Field, model: string) {
  const { reference } = field;

  if (reference?.list) {
    return `<USelect ${vModel(model, field.nullable)} :items="${reference.list.rows}?.rows" value-key="id" label-key="${reference.list.label}" class="w-full" />`;
  }
  if (reference) return (reference.id === "integer" ? number : input())(model, [], field.nullable);

  return fieldTypes[field.type]?.control?.(model, field.arg, field.nullable);
}

export function fieldDefault(field: Field) {
  if (field.nullable) return "null";
  if (field.reference) return "undefined";

  return field.defaultValue ?? fieldTypes[field.type]?.empty(field.arg) ?? '""';
}

/** The `listQuery()` filter kind of a field, as source, or `undefined` when the list does not filter on it. */
export function fieldListFilter(field: Field) {
  if (field.reference) return undefined;
  if (field.type === "string" || field.type === "text" || field.type === "email") return '"text"';
  if (field.type === "boolean") return '"boolean"';
  if (field.type === "date" || field.type === "timestamp") return '"dateRange"';
  if (field.type === "enum") return `[${field.arg.map(quoted).join(", ")}]`;

  return undefined;
}

/** Whether the list may sort by a field. */
export function fieldListSortable(field: Field) {
  return field.type !== "json";
}

export function fieldValues(fields: Field[], file: string, snakeTable: string, imported: string[] = []) {
  const imports = new Map<string, string>();

  for (const { reference } of fields) {
    if (reference && !imported.includes(reference.table)) imports.set(reference.table, `import { ${reference.table} } from "${importFrom(file, reference.file)}";\n`);
  }

  return {
    columns: fields.map((field) => `  ${field.key}: ${fieldColumn(field)},\n`).join(""),
    zodFields: fields.map((field) => `  ${field.key}: ${fieldZod(field)},\n`).join(""),
    rowFields: fields.map((field) => `  ${field.key}: ${fieldRowZod(field)},\n`).join(""),
    pgCore: fields.map((field) => (field.reference ? field.reference.id : (fieldTypes[field.type]?.pg ?? ""))),
    indexes: fields
      .filter((field) => !field.unique && (field.index || field.reference))
      .map((field) => `index("${snakeTable}_${field.column}_idx").on(table.${field.key})`),
    imports: [...imports.values()].join(""),
  };
}

export function inputFieldValues(specs: string[], payload: "json" | "superjson") {
  const fields = parseFields(specs);

  for (const field of fields) {
    const refused = field.type === "references" ? "the type references" : field.unique ? "the modifier unique" : field.index ? "the modifier index" : undefined;
    if (refused) invalid(field.spec, `${refused} needs a database table`, "Remove it. Only make:schema, make:router --crud and make:resource write a table");
  }

  const isoTimestamp = (field: Field) => payload === "json" && field.type === "timestamp";
  const zod = (field: Field) =>
    [
      isoTimestamp(field) ? "z.iso.datetime()" : (fieldTypes[field.type]?.zod(field.arg) ?? ""),
      field.nullable ? ".nullish()" : "",
      field.defaultValue === undefined ? "" : `.default(${field.defaultValue})`,
    ].join("");
  const sample = (field: Field) => (isoTimestamp(field) ? '"2026-01-31T12:00:00Z"' : fieldSample(field));

  return {
    schema: fields.length === 0 ? "z.object({})" : `z.object({\n${fields.map((field) => `    ${field.key}: ${zod(field)},\n`).join("")}  })`,
    sample: fields.length === 0 ? "{}" : `{ ${fields.map((field) => `${field.key}: ${sample(field)}`).join(", ")} }`,
  };
}
