import * as clack from "@clack/prompts";
import { colors } from "consola/utils";
import { isCI } from "std-env";

/**
 * The status glyphs, coloured: `✔` success, `▲` warning, `✖` error,
 * `○` skipped, `◇` a finished step.
 */
export const symbols = {
  success: colors.green("✔"),
  warn: colors.yellow("▲"),
  error: colors.red("✖"),
  skipped: colors.dim("○"),
  step: colors.green("◇"),
};

/**
 * Text styles shared by every command: paths in cyan, durations dim,
 * headers dim and bold.
 */
export const style = {
  path: (text: string) => colors.cyan(text),
  dim: (text: string) => colors.dim(text),
  header: (text: string) => colors.bold(colors.dim(text)),
  duration: (ms: number) => colors.dim(`(${ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`})`),
};

export function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Whether stderr can take spinners and redrawn lines: a TTY with a
 * width, outside CI (a non-empty `CI` or a CI provider's variables, as
 * `std-env` detects them). Otherwise every step prints one static line.
 */
export function isInteractive() {
  return process.stderr.isTTY === true && process.stderr.columns > 0 && !isCI;
}

/**
 * Writes a line of the command's result to stdout: data, a table row,
 * a created path. Everything else goes to stderr.
 */
export function print(line = "") {
  process.stdout.write(`${line}\n`);
}

/**
 * Writes a line of chrome (progress, status, hints) to stderr, so stdout
 * stays clean for pipes and `--json`.
 */
export function report(line = "") {
  process.stderr.write(`${line}\n`);
}

/**
 * Formats a hint line, `  → <text>`, printed under a status line.
 */
export function hint(text: string) {
  return `  ${colors.dim("→")} ${text}`;
}

/**
 * Reports `✔ <message>` on stderr.
 */
export function success(message: string) {
  report(`${symbols.success} ${message}`);
}

/**
 * Reports `▲ <message>` on stderr, with an optional `→` hint line.
 */
export function warn(message: string, hintText?: string) {
  report(`${symbols.warn} ${message}`);
  if (hintText) report(hint(hintText));
}

export function printLine(line: string) {
  if (line.startsWith("! ")) warn(line.slice(2));
  else print(line);
}

/**
 * Reports `✖ <message>` on stderr, with an optional `→` hint line,
 * without stopping the command. To stop it, throw with `fail()`.
 */
export function error(message: string, hintText?: string) {
  report(`${symbols.error} ${message}`);
  if (hintText) report(hint(hintText));
}

/**
 * Opens a multi-step flow (`┌  <title>`) on stderr. Close it with
 * {@link outro}; lines in between go through {@link step} and {@link message}.
 */
export function intro(title: string) {
  clack.intro(title, { output: process.stderr });
}

/**
 * Closes a flow opened with {@link intro} (`└  <message>`) on stderr.
 */
export function outro(message: string) {
  clack.outro(message, { output: process.stderr });
}

/**
 * Reports a finished step inside a flow, `◇  <message>`, on stderr.
 */
export function step(message: string) {
  clack.log.step(message, { output: process.stderr });
}

/**
 * Reports lines inside a flow, each behind the `│` guide, on stderr.
 */
export function message(lines: string | string[]) {
  clack.log.message(lines, { output: process.stderr, spacing: 0 });
}
