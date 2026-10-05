import { REDACTED, SECRET_KEY } from "./sanitized";

const IDENTIFIER = String.raw`(?:"((?:[^"]|"")+)"|\b([a-z_][\w$]*))`;
const PLACEHOLDERS = String.raw`\$\d+(?:\s*,\s*\$\d+)*`;
const COMPARED_TO_PLACEHOLDERS = new RegExp(
  String.raw`${IDENTIFIER}\s*(?:=|<>|!=|\s(?:not\s+)?(?:i?like|in)\s)\s*\(?\s*(${PLACEHOLDERS})`,
  "gi",
);
const INSERT_COLUMNS = /\binsert\s+into\s+[^(]+\(([^)]*)\)\s*values\s*/i;
const PLACEHOLDER = /^\$(\d+)$/;
const PLACEHOLDER_NUMBERS = /\$(\d+)/g;

function columnName(identifier: string) {
  return identifier.trim().replace(/^"|"$/g, "").replace(/""/g, '"');
}

function valueTuples(sql: string) {
  const tuples: string[][] = [];
  let depth = 0;
  let item = "";
  let tuple: string[] = [];

  for (const char of sql) {
    if (char === "(") {
      if (depth > 0) item += char;
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth > 0) item += char;
      else {
        tuples.push([...tuple, item.trim()]);
        tuple = [];
        item = "";
      }
    } else if (depth === 1 && char === ",") {
      tuple.push(item.trim());
      item = "";
    } else if (depth > 0) item += char;
    else if (char !== "," && !/\s/.test(char)) break;
  }

  return tuples;
}

function insertedSecrets(sql: string, secrets: Set<number>) {
  const match = sql.match(INSERT_COLUMNS);

  if (!match || match.index === undefined) return;

  const columns = (match[1] ?? "").split(",").map(columnName);
  const tuples = valueTuples(sql.slice(match.index + match[0].length));

  for (const values of tuples) {
    values.forEach((value, position) => {
      const placeholder = value.match(PLACEHOLDER);

      if (placeholder && SECRET_KEY.test(columns[position] ?? "")) secrets.add(Number(placeholder[1]));
    });
  }
}

function comparedSecrets(sql: string, secrets: Set<number>) {
  for (const [, quoted, bare, placeholders] of sql.matchAll(COMPARED_TO_PLACEHOLDERS)) {
    if (!SECRET_KEY.test(quoted ?? bare ?? "")) continue;

    for (const [, number] of (placeholders ?? "").matchAll(PLACEHOLDER_NUMBERS)) secrets.add(Number(number));
  }
}

export function redactedParams(sql: string, params: readonly unknown[]) {
  const secrets = new Set<number>();

  insertedSecrets(sql, secrets);
  comparedSecrets(sql, secrets);

  return params.map((param, index) => (secrets.has(index + 1) ? REDACTED : param));
}
