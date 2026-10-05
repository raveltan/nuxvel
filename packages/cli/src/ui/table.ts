import { stripVTControlCharacters } from "node:util";
import { print, style } from "./output.ts";

function formatTable(header: string[], rows: string[][]) {
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => stripVTControlCharacters(row[column] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, column) =>
        column === cells.length - 1
          ? cell
          : cell + " ".repeat((widths[column] ?? 0) - stripVTControlCharacters(cell).length),
      )
      .join("  ")
      .trimEnd();

  return [style.header(line(header)), ...rows.map(line)].join("\n");
}

/**
 * Prints rows to stdout as a borderless table: a dim bold header, columns
 * sized to their content (colour codes ignored), two spaces between
 * columns, no trailing spaces and no truncation.
 *
 * @param header the column titles, e.g. `["METHOD", "PATH", "SOURCE"]`.
 * @param rows one array of cells per row, in header order.
 *
 * @example
 * ```ts
 * printTable(["NAME", "EVERY"], schedules.map((schedule) => [schedule.name, schedule.every]));
 * ```
 */
export function printTable(header: string[], rows: string[][]) {
  print(formatTable(header, rows));
}
