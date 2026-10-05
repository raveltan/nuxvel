import { print } from "./output.ts";

/**
 * The shared `--json` flag for read-only listing commands; spread it
 * into a command's `args` and branch on `args.json`.
 *
 * @example
 * ```ts
 * defineCommand({
 *   args: { ...jsonArg },
 *   run: ({ args }) => (args.json ? printJson({ schedules }) : printTable(header, rows)),
 * });
 * ```
 */
export const jsonArg = {
  json: {
    type: "boolean",
    description: "Print one JSON document to stdout instead of a table.",
  },
} as const;

/**
 * Prints `value` as one JSON document on stdout, the only thing a
 * `--json` run writes there.
 */
export function printJson(value: unknown) {
  print(JSON.stringify(value, null, 2));
}
