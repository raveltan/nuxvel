import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BREAKPOINT = "--> statement-breakpoint";
const NAME = String.raw`(?:"(?:[^"]|"")+"|[\w$]+)(?:\.(?:"(?:[^"]|"")+"|[\w$]+))?`;
const EXPAND_STATEMENTS = [
  new RegExp(String.raw`^CREATE\s+(?:TABLE|TYPE|SCHEMA|SEQUENCE|EXTENSION|(?:UNIQUE\s+)?INDEX|VIEW|MATERIALIZED\s+VIEW|POLICY)\b`, "i"),
  new RegExp(String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?${NAME}\s+ADD\s+(?:COLUMN|CONSTRAINT)\b`, "i"),
  new RegExp(String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?${NAME}\s+ALTER\s+COLUMN\s+${NAME}\s+(?:SET\s+DEFAULT|DROP\s+DEFAULT|DROP\s+NOT\s+NULL)\b`, "i"),
  new RegExp(String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?${NAME}\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\b`, "i"),
  new RegExp(String.raw`^ALTER\s+TYPE\s+${NAME}\s+ADD\s+VALUE\b`, "i"),
];
const DROPPED_NAME = [
  new RegExp(String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?${NAME}\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(${NAME})`, "i"),
  new RegExp(String.raw`^DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(${NAME})`, "i"),
];
const CREATED_NAME = [
  new RegExp(String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?${NAME}\s+ADD\s+CONSTRAINT\s+(${NAME})`, "i"),
  new RegExp(String.raw`^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${NAME})\s+ON\b`, "i"),
];

export function migrationStatements(source: string) {
  return source.split(BREAKPOINT).filter((statement) => statement.trim() !== "");
}

export function migrationSql(statements: string[]) {
  return `${statements.map((statement) => statement.trim()).join(`\n${BREAKPOINT}\n`)}\n`;
}

function withoutComments(statement: string) {
  return statement.replace(/^(?:\s*--[^\n]*\n?)*/, "").trim();
}

function objectName(patterns: RegExp[], sql: string) {
  const name = patterns.map((pattern) => pattern.exec(sql)?.[1]).find(Boolean)?.split(".").at(-1);

  return name?.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name?.toLowerCase();
}

export function isBreakingStatement(statement: string, migration: string[]) {
  const sql = withoutComments(statement);

  if (sql === "" || EXPAND_STATEMENTS.some((pattern) => pattern.test(sql))) return false;

  const dropped = objectName(DROPPED_NAME, sql);

  return dropped === undefined || !migration.some((other) => objectName(CREATED_NAME, withoutComments(other)) === dropped);
}

export function statementSummary(statement: string) {
  return withoutComments(statement).split("\n")[0]?.replace(/;$/, "") ?? "";
}

export function moveBreakingStatements(migrationsFolder: string, tag: string) {
  const file = join(migrationsFolder, `${tag}.sql`);
  const statements = migrationStatements(readFileSync(file, "utf8"));
  const breaking = statements.filter((statement) => isBreakingStatement(statement, statements));

  if (breaking.length === 0) return [];

  const contractDir = join(migrationsFolder, "contract");
  if (!existsSync(contractDir)) mkdirSync(contractDir);
  writeFileSync(join(contractDir, `${tag}.sql`), migrationSql(breaking));
  writeFileSync(file, migrationSql(statements.filter((statement) => !breaking.includes(statement))));

  return breaking.map(statementSummary);
}
