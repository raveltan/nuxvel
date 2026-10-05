const STRING_LITERAL = /'(?:[^']|'')*'/g;
const PLACEHOLDER_LIST = /\(\s*\$\d+(?:\s*,\s*\$\d+)*\s*\)/g;
const PLACEHOLDER = /\$\d+/g;
const NUMBER_LITERAL = /\b\d+(?:\.\d+)?\b/g;
const WHITESPACE = /\s+/g;

export function queryFingerprint(sql: string) {
  return sql
    .replace(STRING_LITERAL, "?")
    .replace(PLACEHOLDER_LIST, "(?)")
    .replace(PLACEHOLDER, "?")
    .replace(NUMBER_LITERAL, "?")
    .replace(WHITESPACE, " ")
    .trim();
}
