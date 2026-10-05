const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Formats a value as one CSV cell that a spreadsheet does not run as a
 * formula.
 *
 * Auto-imported on the server. `null` and `undefined` become an empty
 * cell, a `Date` its ISO string, and an object its JSON. Text that starts
 * with `=`, `+`, `-`, `@`, a tab or a carriage return gets a `'` in front,
 * so Excel and Google Sheets show it as text. A cell with a quote, a comma
 * or a line break is quoted. `nuxvel audit:export --format csv` writes
 * every cell with it.
 *
 * @example
 * ```ts
 * const line = [user.id, user.name, user.createdAt].map(csvSafe).join(",");
 * ```
 */
export function csvSafe(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text =
    value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  const cell = FORMULA_START.test(text) ? `'${text}` : text;

  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}
