import { existsSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import type { AppPaths } from "../app-layout/app-paths.ts";
import { fail } from "../ui/fail.ts";
import { toCamelCase } from "./case.ts";

const kebabSegment = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function kebabName(name: string, example: string) {
  if (!kebabSegment.test(name)) {
    fail(`"${name}" is not a valid name`, { hint: `Use one kebab-case word, e.g. ${example}` });
  }

  return name;
}

function nameSegments(name: string) {
  return name
    .split(/[./]/)
    .map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, (_, before: string, upper: string) => `${before}-${upper.toLowerCase()}`));
}

export function dottedName(name: string, example: string) {
  const segments = nameSegments(name);

  if (!segments.every((segment) => kebabSegment.test(segment))) {
    fail(`"${name}" is not a valid name`, { hint: `Use kebab-case or camelCase words joined by . or /, e.g. ${example}` });
  }

  return segments.join(".");
}

export function definitionFile(serverDir: string, folder: string, name: string, kind: string, domain?: string) {
  const segments = name.split(".");
  const dir = domain ? join(serverDir, "domains", domain, basename(folder)) : join(serverDir, folder);

  return `${join(dir, ...(domain ? segments.slice(1) : segments))}.${kind}`;
}

export function domainName(name: string, domain: string | undefined) {
  return domain ? `${kebabName(domain, "post")}.${name}` : name;
}

export function domainFile(serverDir: string, folder: string, name: string, kind: string, domain?: string) {
  return definitionFile(serverDir, folder, domainName(name, domain), kind, domain);
}

export function registeredName(name: string, domain: string | undefined) {
  return domain && domain !== name ? `${domain}.${name}` : name;
}

export function definitionExport(name: string, kind: string) {
  return toCamelCase(`${name}-${kind}`);
}

const schemaFolder = /\/server\/(?:database\/schema|domains\/[^/]+\/schema)\//;
const factoriesFolder = /\/server\/(?:factories|domains\/[^/]+\/factories)\//;
const serverFolder = /^(.*)\/server\/(.+)$/;
const sharedFolder = /^(.*)\/shared\/(.+)$/;

function relativeImport(file: string, target: string) {
  const specifier = relative(dirname(file), target).split(sep).join("/");

  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function aliasedImport(file: string, target: string) {
  if (schemaFolder.test(target)) return schemaFolder.test(file) ? undefined : "#nuxvel/schema";
  if (factoriesFolder.test(target)) return factoriesFolder.test(file) ? undefined : "#nuxvel/factories";

  const [, serverRoot, serverPath] = serverFolder.exec(target) ?? [];

  if (serverRoot !== undefined && serverPath) return /\/layers\/[^/]+$/.test(serverRoot) ? undefined : `#server/${serverPath}`;

  const [, , sharedPath] = sharedFolder.exec(target) ?? [];

  return sharedPath ? `#shared/${sharedPath}` : undefined;
}

export function importFrom(file: string, target: string) {
  const normalized = target.split(sep).join("/");

  if (dirname(file) === dirname(target)) return relativeImport(file, target);

  return aliasedImport(file.split(sep).join("/"), normalized) ?? relativeImport(file, target);
}

export function actionName(name: string) {
  const [domain, action, ...rest] = nameSegments(name);

  const valid =
    domain !== undefined &&
    action !== undefined &&
    rest.length === 0 &&
    kebabSegment.test(domain) &&
    kebabSegment.test(action);

  if (!valid) {
    fail(`"${name}" is not a valid action name`, {
      hint: "Use <domain>/<name>, two kebab-case or camelCase words, e.g. posts/archive-post",
    });
  }

  return { domain, action };
}

export function serverPath(name: string, example: string) {
  const segments = name.split("/");

  if (!segments.every((segment) => /^[\w[\].-]+$/.test(segment) && segment !== "." && segment !== "..")) {
    fail(`"${name}" is not a valid path`, {
      hint: `Use the file's path under server/, without extension, e.g. ${example}`,
    });
  }

  return segments;
}

export function requireFile(cwd: string, file: string, hint: string) {
  if (!existsSync(file)) {
    fail(`${relative(cwd, file)} does not exist`, { hint });
  }
}

export function schemaFile(serverDir: string, table: string, domain?: string) {
  if (domain) return domainFile(serverDir, "schema", table, "schema", domain);

  const file = join(serverDir, "database", "schema", table);

  return existsSync(`${file}.ts`) ? file : `${file}.schema`;
}

export function requireSchemaFile(paths: AppPaths, table: string, domain?: string) {
  const file = schemaFile(paths.serverDir, table, domain);
  requireFile(paths.rootDir, `${file}.ts`, `Create it first: nuxvel make:schema ${table}${domain ? ` --domain ${domain}` : ""}`);

  return file;
}
