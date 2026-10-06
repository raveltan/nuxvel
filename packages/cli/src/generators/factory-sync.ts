import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { getTableColumns, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { glob } from "tinyglobby";
import { factoryDefault } from "@nuxvel/nuxt/factory-defaults";
import { loadAppLayout } from "../app-layout/load-app-layout.ts";
import { hash, manifestKey, readManifest, writeManifest } from "../generated/manifest.ts";
import { fail } from "../ui/fail.ts";
import { type TSESTree, eachNode, importedNames, isCallTo, parseSource } from "../source/parse-source.ts";
import { importFrom } from "./names.ts";

type FactoryCall = { table: TSESTree.Identifier; definition: TSESTree.ObjectExpression | undefined };
type IndexedFactory = { table: PgTable; file: string; name: string };

function findFactoryCall(program: TSESTree.Program) {
  let found: FactoryCall | undefined;

  eachNode(program, (node) => {
    const [table, definition] = !found && isCallTo(node, "defineFactory") ? node.arguments : [];

    if (table?.type !== "Identifier") return;

    found = { table, definition: definition?.type === "ObjectExpression" ? definition : undefined };
  });

  return found;
}

function definedKeys(definition: TSESTree.ObjectExpression | undefined) {
  return new Set(
    (definition?.properties ?? []).flatMap((property) => {
      if (property.type !== "Property" || property.computed) return [];

      return [property.key.type === "Identifier" ? property.key.name : String(property.key.value)];
    }),
  );
}

export async function importTable(modulePath: string, exportName: string) {
  const exported: Record<string, unknown> = await import(pathToFileURL(`${modulePath}.ts`).href);
  const table = exported[exportName];

  return is(table, PgTable) ? table : undefined;
}

type SchemaFiles = () => Promise<string[]>;

const schemaAlias = "#nuxvel/schema";

function schemaFilesOf(cwd: string): SchemaFiles {
  let files: Promise<string[]> | undefined;

  return () => (files ??= loadAppLayout(cwd, ["database/schema"]).then((layout) => (layout.files["database/schema"] ?? []).sort()));
}

async function resolveTable(factoryPath: string, imported: { source: string; imported: string }, schemaFiles: SchemaFiles) {
  if (imported.source !== schemaAlias) {
    const modulePath = resolve(dirname(factoryPath), imported.source);

    return { modulePath, table: await importTable(modulePath, imported.imported) };
  }

  for (const file of await schemaFiles()) {
    const modulePath = file.replace(/\.ts$/, "");
    const table = await importTable(modulePath, imported.imported);

    if (table) return { modulePath, table };
  }

  return { modulePath: undefined, table: undefined };
}

async function loadTable(factoryPath: string, program: TSESTree.Program, identifier: string, schemaFiles: SchemaFiles) {
  const imported = importedNames(program).get(identifier);

  if (!imported) {
    fail(`Could not find the import of "${identifier}" in ${factoryPath}`, {
      hint: "Import the table the factory is defined for from its schema file",
    });
  }

  const { modulePath, table } = await resolveTable(factoryPath, imported, schemaFiles);

  if (!table || !modulePath) {
    fail(`"${identifier}" exported by ${imported.source} is not a Drizzle table`, {
      hint: "Pass defineFactory the pgTable(...) the factory builds rows for",
    });
  }

  return { table, modulePath };
}

function sanitizedHtmlKeys(modulePath: string) {
  const keys = new Set<string>();
  const source = readFileSync(`${modulePath}.ts`, "utf-8");

  eachNode(parseSource(source), (node) => {
    if (node.type !== "Property" || node.computed || node.key.type !== "Identifier") return;
    if (source.slice(...node.value.range).includes("$type<SanitizedHtml>")) keys.add(node.key.name);
  });

  return keys;
}

function exportedFactory(program: TSESTree.Program) {
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") continue;

    for (const { id } of statement.declaration.declarations) {
      if (id.type === "Identifier" && id.name.endsWith("Factory")) return id.name;
    }
  }

  return undefined;
}

const factoryGlobs = ["factories/*.ts", "domains/*/factories/**/*.factory.ts"];

async function indexFactories(files: string[], schemaFiles: SchemaFiles) {
  const indexed: IndexedFactory[] = [];

  for (const file of files) {
    const program = parseSource(readFileSync(file, "utf-8"));
    const call = findFactoryCall(program);
    const name = exportedFactory(program);

    if (call && name) indexed.push({ table: (await loadTable(file, program, call.table.name, schemaFiles)).table, file, name });
  }

  return indexed;
}

export async function indexAppFactories(serverDir: string, cwd: string) {
  const files = await glob(factoryGlobs, { cwd: serverDir });

  return indexFactories(files.sort().map((file) => join(serverDir, file)), schemaFilesOf(cwd));
}

function foreignFactories(table: PgTable, factories: IndexedFactory[], factoryPath: string) {
  const byColumn = new Map<unknown, { factory: IndexedFactory; key: string }>();

  for (const foreignKey of getTableConfig(table).foreignKeys) {
    const { columns, foreignTable, foreignColumns } = foreignKey.reference();
    const factory = factories.find((candidate) => candidate.table === foreignTable && candidate.file !== factoryPath);
    const key = Object.entries(getTableColumns(foreignTable)).find(([, column]) => column === foreignColumns[0])?.[0];

    if (columns.length === 1 && factory && key) byColumn.set(columns[0], { factory, key });
  }

  return byColumn;
}

function insertEntries(source: string, tokens: TSESTree.Token[], call: FactoryCall, entries: string[]) {
  if (!call.definition) {
    const [, tableEnd] = call.table.range;
    return `${source.slice(0, tableEnd)}, {\n${entries.join("\n")}\n}${source.slice(tableEnd)}`;
  }

  const closing = call.definition.range[1] - 1;
  const last = call.definition.properties.at(-1);
  const hasTrailingComma = tokens.some(
    (token) => token.value === "," && last !== undefined && token.range[0] >= last.range[1] && token.range[1] <= closing,
  );
  const upToClosing =
    last === undefined || hasTrailingComma
      ? source.slice(0, closing)
      : `${source.slice(0, last.range[1])},${source.slice(last.range[1], closing)}`;

  return `${upToClosing.trimEnd()}\n${entries.join("\n")}\n${source.slice(closing)}`;
}

function refreshManifestEntry(cwd: string, factoryPath: string, before: string, after: string) {
  const manifest = readManifest(cwd);
  const key = manifestKey(cwd, factoryPath);
  const entry = manifest[key];

  if (!entry || entry.hash !== hash(before)) return;

  writeManifest(cwd, { ...manifest, [key]: { ...entry, hash: hash(after) } });
}

async function syncFactoryFile(cwd: string, factoryPath: string, factories: () => Promise<IndexedFactory[]>, schemaFiles: SchemaFiles) {
  const source = readFileSync(factoryPath, "utf-8");
  const program = parseSource(source);
  const call = findFactoryCall(program);

  if (!call) return [];

  const { table, modulePath } = await loadTable(factoryPath, program, call.table.name, schemaFiles);
  const existing = definedKeys(call.definition);
  const missing = Object.entries(getTableColumns(table)).filter(([key, column]) => column.notNull && !column.hasDefault && !existing.has(key));

  if (missing.length === 0) return [];

  const foreign = getTableConfig(table).foreignKeys.length > 0 ? foreignFactories(table, await factories(), factoryPath) : new Map();
  const imported = importedNames(program);
  const imports = new Set<string>();
  const sanitized = sanitizedHtmlKeys(modulePath);
  const entries = missing.map(([key, column]) => {
    const reference = foreign.get(column);

    if (sanitized.has(key)) {
      if (!imported.has("sanitizeHtml")) imports.add('import { sanitizeHtml } from "@nuxvel/nuxt/factories";\n');
      return `  ${key}: () => sanitizeHtml(faker.lorem.paragraph()),`;
    }

    if (!reference) return `  ${key}: ${factoryDefault(column).source},`;
    if (!imported.has(reference.factory.name)) {
      imports.add(`import { ${reference.factory.name} } from "${importFrom(factoryPath, reference.factory.file.replace(/\.ts$/, ""))}";\n`);
    }

    return `  ${key}: async () => (await ${reference.factory.name}()).${reference.key},`;
  });
  const added = missing.map(([key]) => key);

  if (entries.some((entry) => entry.includes("faker.")) && !imported.has("faker")) imports.add('import { faker } from "@faker-js/faker";\n');

  const synced = `${[...imports].sort().join("")}${insertEntries(source, program.tokens ?? [], call, entries)}`;

  writeFileSync(factoryPath, synced);
  refreshManifestEntry(cwd, factoryPath, source, synced);

  return added;
}

export async function syncFactories(name: string | undefined, cwd: string) {
  const schemaFiles = schemaFilesOf(cwd);
  const layout = await loadAppLayout(cwd, ["factories"]);
  const all = (layout.files.factories ?? []).sort();
  const files = name ? all.filter((file) => [`${name}.factory.ts`, `${name}.ts`].includes(basename(file))) : all;
  const synced: Array<{ file: string; columns: string[] }> = [];

  if (name && files.length === 0) {
    fail(`No factory named "${name}"`, { hint: `Add server/factories/${name}.factory.ts or pass the name of an existing factory` });
  }

  let index: Promise<IndexedFactory[]> | undefined;
  const factories = () => (index ??= indexFactories(all, schemaFiles));

  for (const file of files) {
    const columns = await syncFactoryFile(cwd, file, factories, schemaFiles);
    const serverDir = layout.serverDirs.find((dir) => file.startsWith(`${dir}${sep}`)) ?? layout.serverDir;

    if (columns.length > 0) synced.push({ file: relative(serverDir, file).replace(/^factories\//, ""), columns });
  }

  return synced;
}
