import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simpleTraverse } from "@typescript-eslint/typescript-estree";
import { globSync } from "tinyglobby";
import { isCallTo, parseSource, propertyValue, type TSESTree } from "../../source/parse-source.ts";
import { type AuditedUse, auditedUses, importFrom } from "../audit/audited-uses.ts";
import type { Codemod, ManualStep, Rewrite } from "../codemod.ts";

const SERVER_FILES = ["server/**/*.ts", "layers/*/server/**/*.ts"];

function appSources(cwd: string) {
  return globSync(SERVER_FILES, { cwd, ignore: ["**/node_modules/**"] })
    .sort()
    .map((file) => ({ file, source: readFileSync(join(cwd, file), "utf8") }));
}

function appUses(cwd: string, sources = appSources(cwd)) {
  return sources.flatMap(({ file, source }) => auditedUses(source, file, cwd).map((use) => ({ ...use, file })));
}

function actionExport(program: TSESTree.Program) {
  for (const statement of program.body) {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : undefined;
    const declarator = declaration?.type === "VariableDeclaration" ? declaration.declarations[0] : undefined;
    const call = statement.type === "ExportDefaultDeclaration" ? statement.declaration : declarator?.init;
    const [argument] = call && isCallTo(call, "defineAction") ? call.arguments : [];
    const name = declarator?.id.type === "Identifier" ? declarator.id.name : "default";
    if (argument?.type === "ObjectExpression") return { config: argument, name };
  }

  return undefined;
}

function actionConfig(program: TSESTree.Program) {
  return actionExport(program)?.config;
}

function camelCase(segment: string) {
  return segment.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

function namespacedPath(actionFile: string) {
  const path = actionFile.replace(/^server\/actions\//, "").replace(/(\.action)?\.ts$/, "");

  return `$actions.${path.split("/").map(camelCase).join(".")}`;
}

function otherCaller(use: AuditedUse & { file: string }, cwd: string, sources: { file: string; source: string }[]) {
  const actionFile = use.actionFile ?? "";
  const name = actionExport(parseSource(readFileSync(join(cwd, actionFile), "utf8")))?.name;
  const pattern = `${name && name !== "default" ? `\\b${name}\\b|` : ""}${namespacedPath(actionFile).replace(/[$.]/g, "\\$&")}\\b`;
  const outside = sources.find(({ file, source }) => file !== use.file && file !== actionFile && new RegExp(pattern).test(source));
  if (outside) return outside.file;

  const inRouter = sources.find(({ file }) => file === use.file)?.source.match(new RegExp(pattern, "g")) ?? [];
  const imported = name && name !== "default" && new RegExp(`import[^;]*\\b${name}\\b`).test(sources.find(({ file }) => file === use.file)?.source ?? "") ? 1 : 0;

  return inRouter.length - imported > 1 ? "another procedure of this router" : undefined;
}

function actionProblem(cwd: string, actionFile: string) {
  const config = actionConfig(parseSource(readFileSync(join(cwd, actionFile), "utf8")));

  if (!config || config.properties.length === 0) return `${actionFile} has no defineAction({ ... }) export`;
  if (propertyValue(config, "audit")) return `${actionFile} already has an audit option`;

  return undefined;
}

function problemOf(use: AuditedUse & { file: string }, cwd: string, sources = appSources(cwd)) {
  if (use.problem || !use.actionFile) return use.problem;
  const audits = appUses(cwd, sources).filter(({ actionFile }) => actionFile === use.actionFile).length;
  if (audits > 1) return `${audits} procedures audit ${use.actionFile}`;
  const caller = otherCaller(use, cwd, sources);

  return caller ? `${use.actionFile} is also called from ${caller}, so its audit option would audit that call too` : actionProblem(cwd, use.actionFile);
}

function indentAt(source: string, offset: number) {
  return /[ \t]*$/.exec(source.slice(0, offset))?.[0] ?? "";
}

function declares(program: TSESTree.Program, name: string) {
  return program.body.some(
    (statement) =>
      (statement.type === "ImportDeclaration" && statement.specifiers.some(({ local }) => local.name === name)) ||
      (statement.type === "ExportNamedDeclaration" &&
        statement.declaration?.type === "VariableDeclaration" &&
        statement.declaration.declarations.some(({ id }) => id.type === "Identifier" && id.name === name)),
  );
}

function imports(program: TSESTree.Program) {
  return program.body.filter((statement): statement is TSESTree.ImportDeclaration => statement.type === "ImportDeclaration");
}

function withImport(source: string, program: TSESTree.Program, name: string, from: string) {
  if (declares(program, name)) return source;
  const named = imports(program).find((statement) => statement.source.value === from && statement.specifiers.at(-1)?.type === "ImportSpecifier");
  const lastSpecifier = named?.specifiers.at(-1);
  if (lastSpecifier) return `${source.slice(0, lastSpecifier.range[1])}, ${name}${source.slice(lastSpecifier.range[1])}`;

  const last = imports(program).at(-1);
  const line = `import { ${name} } from "${from}";`;

  return last ? `${source.slice(0, last.range[1])}\n${line}${source.slice(last.range[1])}` : `${line}\n\n${source}`;
}

function withoutUnusedImport(source: string, name: string) {
  const program = parseSource(source);
  let used = false;
  simpleTraverse(program, { enter: (node, parent) => {
    if (node.type === "Identifier" && node.name === name && parent?.type !== "ImportSpecifier") used = true;
  } });
  const statement = imports(program).find(({ specifiers }) => specifiers.some(({ local }) => local.name === name));
  const specifier = statement?.specifiers.find(({ local }) => local.name === name);
  if (used || !statement || !specifier) return source;

  if (statement.specifiers.length === 1) return source.slice(0, statement.range[0]) + source.slice(statement.range[1]).replace(/^\n/, "");
  const index = statement.specifiers.indexOf(specifier);
  const [start, end] = index === 0 ? [specifier.range[0], statement.specifiers[1]?.range[0] ?? specifier.range[1]] : [statement.specifiers[index - 1]?.range[1] ?? specifier.range[0], specifier.range[1]];

  return source.slice(0, start) + source.slice(end);
}

function rewriteAction(source: string, file: string, cwd: string): Rewrite {
  const sources = appSources(cwd);
  const [use] = appUses(cwd, sources).filter(({ actionFile }) => actionFile === file);
  if (!use || problemOf(use, cwd, sources) || !use.targetSource) return { output: source, manual: [] };

  const program = parseSource(source);
  const config = actionConfig(program);
  const [first] = config?.properties ?? [];
  if (!config || !first) return { output: source, manual: [] };

  const option = `audit: { name: ${JSON.stringify(use.name)}, target: ${use.target} },`;
  const input = config.properties.find((property) => property.type === "Property" && property.key.type === "Identifier" && property.key.name === "input");
  const indent = indentAt(source, first.range[0]);
  const comma = input && /^\s*,/.exec(source.slice(input.range[1]));
  const output = comma
    ? `${source.slice(0, input.range[1] + comma[0].length)}\n${indent}${option}${source.slice(input.range[1] + comma[0].length)}`
    : `${source.slice(0, first.range[0])}${option}\n${indent}${source.slice(first.range[0])}`;

  return { output: withImport(output, parseSource(output), use.target, importFrom(use.targetSource, use.file, file)), manual: [] };
}

function wrappedHandler(source: string, use: AuditedUse) {
  const handler = use.mutation?.arguments[0];
  if (!handler || !use.mutation) return source;
  const indent = indentAt(source, use.mutation.callee.range[1] - "mutation".length - 1);
  const body = [
    "async (opts) => {",
    `  const result = await (${source.slice(...handler.range)})(opts);`,
    `  await audit(${JSON.stringify(use.name)}, { type: getTableName(${use.target}), id: opts.input.id });`,
    "  return result;",
    "}",
  ].join(`\n${indent}`);

  return `${source.slice(0, handler.range[0])}${body}${source.slice(handler.range[1])}`;
}

function rewriteRouter(source: string, file: string, cwd: string): Rewrite {
  const manual: ManualStep[] = [];
  let output = source;
  let wrapped = false;
  const moved = new Set<string>();

  const sources = appSources(cwd);

  for (const use of auditedUses(source, file, cwd).reverse()) {
    const problem = problemOf({ ...use, file }, cwd, sources);
    const { call } = use;

    if (problem) {
      manual.push({ line: use.line, message: `${problem}: move ${call} to the audit option of the action, or to audit() in the handler` });
      continue;
    }
    if (use.mutation) {
      output = wrappedHandler(output, use);
      wrapped = true;
      manual.push({ line: use.line, message: `${call} became audit() in the handler, which records no changed columns: give it { changes } if the log needs them` });
    }
    output = output.slice(0, use.removal[0]) + output.slice(use.removal[1]);
    moved.add(use.target);
  }

  for (const target of moved) output = withoutUnusedImport(output, target);

  return { output: wrapped ? withImport(output, parseSource(output), "getTableName", "drizzle-orm") : output, manual: manual.reverse() };
}

export const audit: Codemod = {
  name: "audit",
  version: "0.3.0",
  description:
    "Moves the audited() middleware of a procedure to the audit option of the action it calls, or to audit() in its handler when it calls no action",
  files: SERVER_FILES,
  rewrite(source, file, cwd) {
    if (file.includes("/actions/") && source.includes("defineAction")) return rewriteAction(source, file, cwd);

    return rewriteRouter(source, file, cwd);
  },
};
