import { join } from "node:path";
import type { AppPaths } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { fail } from "../ui/fail.ts";
import { type Field, fieldListFilter, fieldListSortable, fieldValues } from "./fields.ts";
import { toCamelCase, toPascalCase, toSnakeCase } from "./case.ts";
import { importFrom, kebabName, schemaFile } from "./names.ts";

export interface TableOptions {
  softDeletes?: boolean;
  searchable?: string[];
  domain?: string;
  fields?: Field[];
}

export function searchableColumns(value: string | undefined): string[] {
  const columns = (value ?? "").split(",").map((column) => column.trim()).filter(Boolean);

  for (const column of columns) {
    if (!/^[a-z][a-z0-9_]*$/.test(column)) {
      fail(`"${column}" is not a valid column name`, { hint: "Use snake_case column names, e.g. --searchable title,body" });
    }
  }

  return columns;
}

function listInput(camelName: string, options: TableOptions) {
  const fields = options.fields ?? [];
  const searchable = (options.searchable ?? []).map(toCamelCase);
  const sort = ["id", ...fields.filter(fieldListSortable).map((field) => field.key), ...searchable, "createdAt", "updatedAt"];
  const filters = fields.flatMap((field) => {
    const kind = fieldListFilter(field);

    return kind === undefined ? [] : [`    ${field.key}: ${kind},\n`];
  });

  return [
    "",
    "// The columns the list sorts and filters by. The router and the page both read it, so they cannot drift.",
    `export const ${camelName}ListColumns = {`,
    `  sort: [${sort.map((key) => `"${key}"`).join(", ")}],`,
    filters.length > 0 ? `  filters: {\n${filters.join("")}  },` : "  filters: {},",
    "} as const;",
    "",
    `export const ${camelName}ListInput = listQuery(${camelName}ListColumns);`,
    "",
  ].join("\n");
}

function tableValues(file: string, snakeName: string, options: TableOptions, crud: boolean) {
  const searchable = options.searchable ?? [];
  const searching = searchable.length > 0;
  const fields = fieldValues(options.fields ?? [], file, snakeName, crud ? ["userTable"] : []);
  const databaseImports = [
    ...(crud || fields.belongsTo ? ["belongsTo"] : []),
    ...(searching ? ["searchable", "searchIndex"] : []),
    ...(options.softDeletes ? ["softDeletes"] : []),
    "timestamps",
  ];
  const indexes = [...(searching ? ["searchIndex(table)"] : []), ...fields.indexes];
  const pgCore = new Set([
    "pgTable",
    "serial",
    ...(searching ? ["text"] : []),
    ...(crud || fields.indexes.length > 0 ? ["index"] : []),
    ...fields.pgCore,
  ]);
  const searchColumns = searchable.map((column) => `  ${toCamelCase(column)}: text("${column}").notNull(),\n`).join("");
  const searchFields = searchable.map((column) => `  ${toCamelCase(column)}: z.string().trim().min(1),\n`).join("");
  const zodFields = `${fields.zodFields}${searchFields}`;
  const rowFields = [
    "  id: z.number(),\n",
    crud ? "  ownerId: z.string(),\n" : "",
    fields.rowFields,
    ...searchable.map((column) => `  ${toCamelCase(column)}: z.string(),\n`),
    "  createdAt: z.date(),\n  updatedAt: z.date(),\n",
    options.softDeletes ? "  deletedAt: z.date().nullable(),\n" : "",
  ];

  return {
    pgCoreImports: [...pgCore].sort().join(", "),
    databaseImports: databaseImports.join(", "),
    referenceImports: fields.imports,
    columns: `${fields.columns}${searching ? `${searchColumns}  ...searchable([${searchable.map((column) => `"${column}"`).join(", ")}]),\n` : ""}`,
    softDeletesColumn: options.softDeletes ? "  ...softDeletes(),\n" : "",
    tableIndexes: indexes.length > 0 ? `, (table) => [${indexes.join(", ")}]` : "",
    crudIndexes: indexes.map((index) => `, ${index}`).join(""),
    createFields: zodFields ? `{\n${zodFields}}` : "{}",
    rowFields: rowFields.join(""),
  };
}

export function tableFile(paths: AppPaths, name: string, domain?: string) {
  return domain ? schemaFile(paths.serverDir, name, domain) : join(paths.serverDir, "database", "schema", `${name}.schema`);
}

export function schemaFiles(name: string, paths: AppPaths, options: TableOptions = {}, crud = false): GeneratedFile[] {
  kebabName(name, "blog-post");

  const file = `${tableFile(paths, name, options.domain)}.ts`;
  const values = {
    camelName: toCamelCase(name),
    pascalName: toPascalCase(name),
    snakeName: toSnakeCase(name),
    authImport: importFrom(file, schemaFile(paths.appServerDir, "auth")),
    ...tableValues(file, toSnakeCase(name), options, crud),
    listInput: crud ? listInput(toCamelCase(name), options) : "",
  };

  return [
    {
      path: file,
      template: crud ? "schema-table-crud.ts.txt" : "schema-table.ts.txt",
      values,
    },
    { path: join(paths.sharedDir, "schemas", `${name}.ts`), template: "schema-zod.ts.txt", values },
  ];
}
